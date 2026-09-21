import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Text style={styles.title}>3D Nexus</Text>
        <Text style={styles.text}>Başlangıç testi</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0a0b" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  title: { color: "#ffffff", fontSize: 28, fontWeight: "700" },
  text: { color: "#aeb5bf", fontSize: 15 }
});
