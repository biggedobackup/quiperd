plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.defisenligne.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
            applicationId = "com.defisenligne.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Hôte des liens profonds : celui du site qui sert `/defis/<id>`. Un lien partagé
        // ouvre alors l'application directement sur le défi, au lieu du navigateur.
        //
        // Il ne peut PAS être écrit en dur dans le manifeste : c'est la même application qui
        // vise le domaine de production et, en développement, l'alias de l'hôte vu depuis
        // l'émulateur. On le passe donc au build :
        //   flutter build apk --dart-define=SITE_BASE_URL=https://defisenligne.com \
        //                     -Pdeep-link-host=defisenligne.com
        // Les deux vont ensemble : `SITE_BASE_URL` construit le lien, `deep-link-host` décide
        // quel lien l'application intercepte. Les désaccorder produit des liens que
        // l'application ignore, sans le moindre message d'erreur.
        manifestPlaceholders["deepLinkHost"] =
            (project.findProperty("deep-link-host") as String?) ?: "10.0.2.2"
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
