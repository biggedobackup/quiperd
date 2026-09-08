// Import explicite : dans un script Gradle Kotlin, `java` désigne l'extension Gradle du même
// nom et masque le paquet — `java.util.Properties` ne se résout pas.
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Clé de signature de production, lue dans `android/key.properties` (non versionné, comme le
// keystore lui-même). Le fichier est ABSENT sur un poste qui n'a pas à publier : dans ce cas on
// retombe sur la clé de debug, et `flutter run` continue de marcher sans rien configurer.
//
// Signer pour de vrai n'est pas une coquetterie ici : la clé de debug a un mot de passe public
// et connu de tous. Un APK signé avec elle peut être remplacé par n'importe qui, et Android
// accepterait la mise à jour — sur une application où l'on dépose de l'argent, c'est
// inacceptable.
val proprietesCle = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.defisenligne.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // `flutter_local_notifications` s'appuie sur les API de date de Java 8. Le désucrage les
        // réimplémente pour les vieux Android ; sans lui, la compilation s'arrête net.
        isCoreLibraryDesugaringEnabled = true
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

    signingConfigs {
        if (proprietesCle.isNotEmpty()) {
            create("production") {
                storeFile = rootProject.file(proprietesCle.getProperty("storeFile"))
                storePassword = proprietesCle.getProperty("storePassword")
                keyAlias = proprietesCle.getProperty("keyAlias")
                keyPassword = proprietesCle.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // La clé de production quand elle est là, celle de debug sinon — de sorte que
            // `flutter run --release` marche encore sur un poste sans keystore.
            signingConfig = signingConfigs.findByName("production") ?: signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
