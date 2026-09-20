import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { exportSceneImage, type ExportFormat, type ExportOptions, type ExportResult } from "./src/native/exportImage";
import * as Sharing from "expo-sharing";
import { useStudioStore } from "./src/native/store";
import {
  Alert,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const SAMPLE_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

type LightPreset = "Ürün" | "Portre" | "Karanlık" | "Beyaz stüdyo" | "Dış mekan";

const LIGHT_PRESETS: LightPreset[] = ["Ürün", "Portre", "Karanlık", "Beyaz stüdyo", "Dış mekan"];




class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.fatalError}>
            <Text style={styles.fatalTitle}>3D Nexus açılırken hata oluştu.</Text>
            <Text style={styles.fatalMessage}>{this.state.error.message}</Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function StudioApp() {
  const rotation = useRef({ x: 0, y: 0 });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [sceneOn, setSceneOn] = useState(false);
  const [hydrated, setHydrated] = useState(useStudioStore.persist.hasHydrated());

  const selectedPreset = useStudioStore((state) => state.selectedPreset) as LightPreset;
  const exportFormat = useStudioStore((state) => state.exportFormat);
  const exportQuality = useStudioStore((state) => state.exportQuality);
  const exportWidth = useStudioStore((state) => state.exportWidth);
  const exportHeight = useStudioStore((state) => state.exportHeight);
  const targetKb = useStudioStore((state) => state.targetKb);
  const storedRotation = useStudioStore((state) => state.rotation);
  const cameraZ = useStudioStore((state) => state.cameraZ);
  const lastModel = useStudioStore((state) => state.lastModel);
  const tourDone = useStudioStore((state) => state.tourDone);
  const tourStep = useStudioStore((state) => state.tourStep);
  const gallery = useStudioStore((state) => state.gallery);
  const setSelectedPreset = useStudioStore((state) => state.setSelectedPreset);
  const setExportFormat = useStudioStore((state) => state.setExportFormat);
  const setExportQuality = useStudioStore((state) => state.setExportQuality);
  const setExportWidth = useStudioStore((state) => state.setExportWidth);
  const setExportHeight = useStudioStore((state) => state.setExportHeight);
  const setTargetKb = useStudioStore((state) => state.setTargetKb);
  const setStoredRotation = useStudioStore((state) => state.setRotation);
  const setCameraZ = useStudioStore((state) => state.setCameraZ);
  const setLastModel = useStudioStore((state) => state.setLastModel);
  const setTourDone = useStudioStore((state) => state.setTourDone);
  const setTourStep = useStudioStore((state) => state.setTourStep);
  const addGalleryItem = useStudioStore((state) => state.addGalleryItem);
  const setGallery = useStudioStore((state) => state.setGallery);


  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.toolbar}>
        <Pressable style={styles.button} onPress={() => void loadSample()}>
          <Text style={styles.buttonText}>Örnek model</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => void selectModel()}>
          <Text style={styles.buttonText}>GLB seç</Text>
        </Pressable>
        <Pressable style={styles.helpButton} onPress={() => { setTourDone(false); setTourStep(0); }}>
          <Text style={styles.buttonText}>Yardım</Text>
        </Pressable>
      </View>
      <View style={styles.stage}>
        {!sceneOn ? (
          <Pressable style={styles.openSceneButton} onPress={() => setSceneOn(true)}>
            <Text style={styles.openSceneText}>Sahneyi aç</Text>
          </Pressable>
        ) : (() => {
          const SceneCanvas = require("./src/native/SceneCanvas").default;
          return (
            <SceneCanvas
              rotation={storedRotation}
              cameraZ={cameraZ}
              onError={(message: string) => setGlError(message)}
            />
          );
        })()}
        {glError && <Text style={styles.glErrorText}>{glError}</Text>}
      </View>
      <View style={styles.exportSection}>
        <Pressable style={styles.exportHeader} onPress={() => setExportOpen((value) => !value)}>
          <Text style={styles.exportHeaderText}>Üret</Text>
          <Text style={styles.exportHeaderText}>{exportOpen ? "Kapat" : "Aç"}</Text>
        </Pressable>
        {exportOpen && (
          <View style={styles.exportPanel}>
            <View style={styles.row}>
              {(["png", "jpg", "webp"] as ExportFormat[]).map((format) => (
                <Pressable
                  key={format}
                  style={[styles.choice, exportFormat === format && styles.choiceSelected]}
                  onPress={() => setExportFormat(format)}
                >
                  <Text style={styles.choiceText}>{format.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.label}>Kalite: {exportQuality}</Text>
              <Pressable
                disabled={exportFormat === "png"}
                style={[styles.stepButton, exportFormat === "png" && styles.disabled]}
                onPress={() => setExportQuality((value) => Math.max(1, value - 5))}
              >
                <Text style={styles.stepText}>-</Text>
              </Pressable>
              <Pressable
                disabled={exportFormat === "png"}
                style={[styles.stepButton, exportFormat === "png" && styles.disabled]}
                onPress={() => setExportQuality((value) => Math.min(100, value + 5))}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={exportWidth ? String(exportWidth) : ""}
                onChangeText={(value) => setExportWidth(Number(value) || 0)}
                keyboardType="number-pad"
                placeholder="Genişlik"
                placeholderTextColor="#737b86"
              />
              <TextInput
                style={styles.input}
                value={exportHeight ? String(exportHeight) : ""}
                onChangeText={(value) => setExportHeight(Number(value) || 0)}
                keyboardType="number-pad"
                placeholder="Yükseklik"
                placeholderTextColor="#737b86"
              />
              <TextInput
                style={styles.input}
                value={targetKb ? String(targetKb) : ""}
                onChangeText={(value) => setTargetKb(value ? Number(value) || null : null)}
                keyboardType="number-pad"
                placeholder="Hedef KB"
                placeholderTextColor="#737b86"
              />
            </View>
            <Pressable
              disabled={exporting}
              style={[styles.generateButton, exporting && styles.disabled]}
              onPress={() => void createExport()}
            >
              <Text style={styles.generateText}>{exporting ? "Üretiliyor…" : "Görsel üret"}</Text>
            </Pressable>
            {exportResult && (
              <View style={styles.resultRow}>
                <Text style={styles.resultText}>
                  {Math.ceil(exportResult.bytes / 1024)} KB · {exportResult.width}x{exportResult.height}
                </Text>
                <Pressable style={styles.shareButton} onPress={() => void shareExport()}>
                  <Text style={styles.shareText}>Paylaş / kaydet</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
      {gallery.length > 0 && (
        <View style={styles.galleryList}>
          <Text style={styles.galleryTitle}>Galeri</Text>
          {gallery.slice(0, 8).map((item) => (
            <Pressable
              key={item.uri}
              style={styles.galleryRow}
              onPress={() => void Sharing.shareAsync(item.uri)}
            >
              <Text style={styles.galleryText}>
                {Math.ceil(item.bytes / 1024)} KB · {new Date(item.createdAt).toLocaleDateString("tr-TR")}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.presetBar}>
        {LIGHT_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            style={[
              styles.presetButton,
              selectedPreset === preset && styles.presetButtonSelected,
            ]}
            onPress={() => applyLightPreset(preset)}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.presetText,
                selectedPreset === preset && styles.presetTextSelected,
              ]}
            >
              {preset}
            </Text>
          </Pressable>
        ))}
      </View>
      {!tourDone && hydrated && (
        <View style={styles.tourOverlay}>
          <View style={styles.tourCard}>
            <Text style={styles.tourCounter}>{tourStep + 1} / 6</Text>
            <Text style={styles.tourText}>
              {[
                "Örnek model veya GLB seç",
                "Tek parmak döndür, iki parmak yakınlaştır",
                "Altta ışık hazır ayarları",
                "Üret: format, kalite, KB",
                "Paylaş / galeriye kaydet",
                "Uygulama kapanınca kaldığın yerden devam",
              ][tourStep]}
            </Text>
            <View style={styles.tourActions}>
              <Pressable onPress={() => { setTourDone(true); setTourStep(0); }}>
                <Text style={styles.tourActionText}>Atla</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (tourStep >= 5) {
                    setTourDone(true);
                    setTourStep(0);
                  } else {
                    setTourStep(tourStep + 1);
                  }
                }}
              >
                <Text style={styles.tourActionText}>{tourStep >= 5 ? "Bitir" : "İleri"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0a0b" },
  fatalError: { flex: 1, justifyContent: "center", padding: 24, gap: 10 },
  fatalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  fatalMessage: { color: "#c7cdd5", fontSize: 14, lineHeight: 20 },
  glError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0a0a0b",
  },
  glErrorText: { color: "#f2f4f7", fontSize: 14, textAlign: "center" },
  toolbar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0a0a0b",
  },
  button: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b313a",
    backgroundColor: "#15191f",
  },
  buttonText: { color: "#f2f4f7", fontSize: 13, fontWeight: "600" },
  helpButton: {
    height: 48,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b313a",
    backgroundColor: "#15191f",
  },
  stage: { flex: 1, justifyContent: "center" },
  openSceneButton: { alignSelf: "center", minWidth: 220, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#246fb2" },
  openSceneText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  gl: { flex: 1 },
  exportSection: {
    borderTopWidth: 1,
    borderColor: "#20252c",
    backgroundColor: "#0a0a0b",
  },
  exportHeader: {
    height: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exportHeaderText: { color: "#f2f4f7", fontSize: 14, fontWeight: "700" },
  exportPanel: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  row: { flexDirection: "row", gap: 6 },
  choice: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2b313a",
    borderRadius: 8,
  },
  choiceSelected: { borderColor: "#4aa3ff", backgroundColor: "#172331" },
  choiceText: { color: "#f2f4f7", fontSize: 12, fontWeight: "600" },
  settingRow: { height: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flex: 1, color: "#c7cdd5", fontSize: 13 },
  stepButton: {
    width: 44,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#20262e",
  },
  stepText: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#2b313a",
    borderRadius: 8,
    color: "#ffffff",
    backgroundColor: "#111419",
    fontSize: 12,
  },
  generateButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#246fb2",
  },
  generateText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultText: { flex: 1, color: "#c7cdd5", fontSize: 12 },
  shareButton: { height: 36, paddingHorizontal: 12, justifyContent: "center", borderRadius: 8, backgroundColor: "#20262e" },
  shareText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  galleryList: {
    maxHeight: 190,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: "#20252c",
    backgroundColor: "#0a0a0b",
  },
  galleryTitle: { color: "#f2f4f7", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  galleryRow: { height: 20, justifyContent: "center" },
  galleryText: { color: "#aeb5bf", fontSize: 11 },
  tourOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  tourCard: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#343b45",
    backgroundColor: "#15191f",
    gap: 14,
  },
  tourCounter: { color: "#8e98a6", fontSize: 12 },
  tourText: { color: "#ffffff", fontSize: 18, fontWeight: "700", lineHeight: 25 },
  tourActions: { flexDirection: "row", justifyContent: "space-between" },
  tourActionText: { color: "#79baff", fontSize: 15, fontWeight: "700" },
  presetBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: "#0a0a0b",
  },
  presetButton: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#252a31",
    backgroundColor: "#111419",
  },
  presetButtonSelected: {
    borderColor: "#4aa3ff",
    backgroundColor: "#172331",
  },
  presetText: {
    color: "#aeb5bf",
    fontSize: 10,
    fontWeight: "600",
  },
  presetTextSelected: {
    color: "#ffffff",
  },
});


export default function App() {
  return (
    <ErrorBoundary>
      <StudioApp />
    </ErrorBoundary>
  );
}
