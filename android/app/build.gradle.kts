import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Khoá ký bản phát hành: android/keystore.properties (không đưa lên git). Không có thì ký bằng khoá debug.
val ks = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "vn.benoc.pos"
    compileSdk = 35

    defaultConfig {
        applicationId = "vn.benoc.pos"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "1.4"
    }

    // 2 bản cùng mã nguồn, cùng applicationId + khoá ký (cài đè qua lại được):
    //  - lite : bản đầy đủ (benoc-pos-thong-bao.apk), có đọc thông báo chuyển khoản, KHÔNG có OCR
    //  - coban: bản đăng trên trang quán (benoc-pos.apk), như lite nhưng bỏ đọc thông báo chuyển khoản
    //  - ocr : thêm OCR trên máy (ONNX Runtime + mô hình PP-OCRv5 mobile, ~37MB) để test / làm đồ án
    flavorDimensions += "ocr"
    productFlavors {
        create("lite") { dimension = "ocr" }
        // coban: như lite nhưng KHÔNG có đọc thông báo chuyển khoản (không xin quyền đọc thông báo → mở APK trên điện thoại không bị Play Protect chặn)
        create("coban") { dimension = "ocr"; versionNameSuffix = "-coban" }
        create("ocr") {
            dimension = "ocr"
            versionNameSuffix = "-ocr"
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }   // điện thoại ARM 64 + 32 bit
        }
    }
    // Nén thư viện mã máy trong APK (ONNX Runtime 34MB → ~13MB); mô hình .onnx để nguyên cho đọc nhanh
    packaging { jniLibs { useLegacyPackaging = true } }
    androidResources { noCompress += listOf("onnx") }

    signingConfigs {
        if (ks.getProperty("storeFile") != null) create("release") {
            storeFile = rootProject.file(ks.getProperty("storeFile"))
            storePassword = ks.getProperty("storePassword")
            keyAlias = ks.getProperty("keyAlias")
            keyPassword = ks.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    sourceSets { getByName("coban") { java.srcDir("src/lite/java") } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    "ocrImplementation"("com.microsoft.onnxruntime:onnxruntime-android:1.31.1")
}
