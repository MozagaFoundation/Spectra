# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# by the Android Gradle plugin's default ProGuard file.
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.mozaga.exo.VdfModule { *; }

# Add any project specific keep options here:
