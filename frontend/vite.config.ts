import { defineConfig, type PluginOption } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Port 3000 : seule origine autorisée par le CORS du backend (CORS_ORIGIN).
export default defineConfig(async () => {
  // Ordre imposé : Tailwind, puis Start, (Nitro), puis React — React toujours après Start.
  const plugins: PluginOption[] = [tailwindcss(), tanstackStart()]

  // Nitro produit la sortie Node `.output/` pour la production (`bun run start`).
  // Optionnel en développement : le serveur `vite dev` fonctionne sans.
  try {
    // Spécificateur dans une variable : pas d'erreur de typage quand le paquet n'est pas installé.
    const moduleNitro = 'nitro/vite'
    const { nitro } = (await import(moduleNitro)) as { nitro: () => PluginOption }
    plugins.push(nitro())
  } catch {
    // paquet `nitro` absent : build de production indisponible, dev inchangé
  }

  plugins.push(viteReact())

  return {
    server: {
      port: 3000,
      strictPort: true,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins,
  }
})
