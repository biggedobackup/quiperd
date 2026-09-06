package config

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis est le client global (sessions JWT, cache statistiques/classements).
var Redis *redis.Client

// ConnecterRedis ouvre la connexion Redis et vérifie le PING.
func ConnecterRedis(c *Config) error {
	Redis = redis.NewClient(&redis.Options{
		Addr:         c.RedisAddr,
		Password:     c.RedisPassword,
		DB:           c.RedisDB,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	ctx, annuler := context.WithTimeout(context.Background(), 5*time.Second)
	defer annuler()
	if err := Redis.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("ping Redis: %w", err)
	}
	return nil
}

// PingRedis vérifie la disponibilité de Redis (route /api/sante).
func PingRedis() error {
	if Redis == nil {
		return fmt.Errorf("redis non initialisé")
	}
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	return Redis.Ping(ctx).Err()
}

// OptionsAsynq construit les options de connexion Redis pour Asynq.
func OptionsAsynq(c *Config) (addr, password string, db int) {
	return c.RedisAddr, c.RedisPassword, c.RedisDB
}
