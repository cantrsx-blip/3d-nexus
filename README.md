# 3D Nexus (Expo Android)

Bu dal, 3D Nexus'un Expo Android sürümüdür.

## APK

APK'yı kendi bilgisayarınızda EAS ile oluşturmak için:

```sh
git clone https://github.com/cantrsx-blip/3d-nexus.git
cd 3d-nexus
git checkout feat/expo-android
npm install
npx expo install --fix
npx eas login
npx eas build:configure
npx eas build --platform android --profile preview
```

Build tamamlandığında Expo sayfasındaki APK bağlantısını telefona indirin. Android'de gerekirse bilinmeyen kaynaklardan uygulama kurma iznini açıp APK'yı kurun.

EAS build henüz bu repo üzerinde çalıştırılmış değildir.
