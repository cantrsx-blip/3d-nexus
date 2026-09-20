import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { exportSceneImage, type ExportFormat, type ExportOptions, type ExportResult } from "./src/native/exportImage";
import * as Sharing from "expo-sharing";
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

type SceneState = {
  gl: any;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  placeholder: THREE.Mesh;
  lightRig: THREE.Group;
  modelPivot: THREE.Group | null;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const outputLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(outputLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = chars.indexOf(clean[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return bytes.buffer.slice(0, index);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

export default function App() {
  const rotation = useRef({ x: 0, y: 0 });
  const baseRot = useRef({ x: 0, y: 0 });
  const pinchDistance = useRef<number | null>(null);
  const pinchStartZ = useRef(3);
  const frameId = useRef<number | null>(null);
  const cancelFrame = useRef<((id: number) => void) | null>(null);
  const sceneState = useRef<SceneState | null>(null);
  const glViewRef = useRef<GLView | null>(null);
  const pendingModelRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);
  const [selectedPreset, setSelectedPreset] = useState<LightPreset>("Ürün");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportQuality, setExportQuality] = useState(90);
  const [exportWidth, setExportWidth] = useState("1920");
  const [exportHeight, setExportHeight] = useState("1080");
  const [targetKb, setTargetKb] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const applyLightPreset = (preset: LightPreset) => {
    setSelectedPreset(preset);
    const state = sceneState.current;
    if (!state) return;

    state.lightRig.clear();

    const addDirectional = (
      color: number,
      intensity: number,
      position: [number, number, number],
    ) => {
      const light = new THREE.DirectionalLight(color, intensity);
      light.position.set(...position);
      state.lightRig.add(light);
    };

    if (preset === "Ürün") {
      state.renderer.setClearColor(0x0a0a0b, 1);
      state.lightRig.add(new THREE.AmbientLight(0xffffff, 1.15));
      addDirectional(0xffffff, 2.5, [3, 4, 5]);
      addDirectional(0xbfd8ff, 1.1, [-4, 2, 2]);
    } else if (preset === "Portre") {
      state.renderer.setClearColor(0x0a0a0b, 1);
      state.lightRig.add(new THREE.AmbientLight(0xffead8, 0.9));
      addDirectional(0xffd7b0, 2.3, [2, 4, 4]);
      addDirectional(0xb9d7ff, 0.8, [-3, 1, 2]);
    } else if (preset === "Karanlık") {
      state.renderer.setClearColor(0x050608, 1);
      state.lightRig.add(new THREE.AmbientLight(0x9eb7d6, 0.28));
      addDirectional(0x8fb9ff, 1.8, [4, 3, 2]);
      addDirectional(0xffffff, 0.45, [-3, -1, 1]);
    } else if (preset === "Beyaz stüdyo") {
      state.renderer.setClearColor(0xe8eaed, 1);
      state.lightRig.add(new THREE.AmbientLight(0xffffff, 1.8));
      addDirectional(0xffffff, 2.1, [3, 5, 4]);
      addDirectional(0xffffff, 1.2, [-4, 2, 3]);
    } else {
      state.renderer.setClearColor(0x8b9ba8, 1);
      state.lightRig.add(new THREE.AmbientLight(0xdcecff, 1.25));
      addDirectional(0xfff0cf, 2.6, [5, 7, 4]);
      addDirectional(0xb9d7ff, 0.65, [-4, 2, -2]);
    }
  };

  const applyLoadedModel = (loadedScene: THREE.Group, loadId: number) => {
    const state = sceneState.current;
    if (!state || loadId !== loadIdRef.current) {
      disposeObject(loadedScene);
      return;
    }

    if (state.modelPivot) {
      state.scene.remove(state.modelPivot);
      disposeObject(state.modelPivot);
    }

    const box = new THREE.Box3().setFromObject(loadedScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2 / maxSize;

    loadedScene.scale.setScalar(scale);
    loadedScene.position.set(
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    );

    const pivot = new THREE.Group();
    pivot.add(loadedScene);
    state.placeholder.visible = false;
    state.modelPivot = pivot;
    state.scene.add(pivot);
    state.camera.position.z = THREE.MathUtils.clamp(3.2, 1.2, 12);
    rotation.current = { x: 0, y: 0 };
    baseRot.current = { x: 0, y: 0 };
  };

  const loadModel = async (uri: string) => {
    const state = sceneState.current;
    if (!state) {
      pendingModelRef.current = uri;
      return;
    }

    const loadId = ++loadIdRef.current;
    const loader = new GLTFLoader();
    const onError = () => {
      if (loadId === loadIdRef.current) {
        Alert.alert(
          "3D Nexus",
          "Model yüklenemedi. GLB dosyasını yeniden seçmeyi deneyin.",
        );
      }
    };

    if (/^https?:\/\//i.test(uri)) {
      loader.load(
        uri,
        (gltf) => applyLoadedModel(gltf.scene, loadId),
        undefined,
        onError,
      );
      return;
    }

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (loadId !== loadIdRef.current) return;
      const buffer = base64ToArrayBuffer(base64);
      loader.parse(
        buffer,
        "",
        (gltf) => applyLoadedModel(gltf.scene, loadId),
        onError,
      );
    } catch {
      onError();
    }
  };

  const exportCurrentScene = async (options: ExportOptions) => {
    try {
      return await exportSceneImage(glViewRef.current as any, options);
    } catch (error) {
      Alert.alert(
        "3D Nexus",
        error instanceof Error ? error.message : "Görsel üretilemedi.",
      );
      return null;
    }
  };

  const createExport = async () => {
    const width = THREE.MathUtils.clamp(Number(exportWidth) || 1920, 256, 4096);
    const height = THREE.MathUtils.clamp(Number(exportHeight) || 1080, 256, 4096);
    const target = Number(targetKb);

    setExporting(true);
    const result = await exportCurrentScene({
      format: exportFormat,
      quality: exportQuality,
      width,
      height,
      targetKb: target > 0 ? target : undefined,
    });
    setExporting(false);
    if (result) setExportResult(result);
  };

  const shareExport = async () => {
    if (!exportResult) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("3D Nexus", "Bu cihazda paylaşım kullanılamıyor.");
        return;
      }
      await Sharing.shareAsync(exportResult.uri);
    } catch {
      Alert.alert("3D Nexus", "Görsel paylaşılamadı.");
    }
  };

  const selectModel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["model/gltf-binary", "model/gltf+json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;
      const sourceName = asset.name || decodeURIComponent(asset.uri.split("/").pop() || "");
      if (/\.gltf(?:$|\?)/i.test(sourceName)) {
        Alert.alert("3D Nexus", "Harici dokulu GLTF desteklenmiyor. GLB seçin.");
        return;
      }
      if (!/\.glb(?:$|\?)/i.test(sourceName)) {
        Alert.alert("3D Nexus", "Lütfen GLB veya GLTF dosyası seçin.");
        return;
      }

      let uri = asset.uri;
      if (uri.startsWith("content://")) {
        const extension = sourceName.toLowerCase().includes(".gltf") ? ".gltf" : ".glb";
        const destination =
          FileSystem.cacheDirectory + "3d-nexus-" + Date.now() + extension;
        await FileSystem.copyAsync({ from: uri, to: destination });
        uri = destination;
      }
      await loadModel(uri);
    } catch {
      Alert.alert("3D Nexus", "Dosya seçilirken bir hata oluştu.");
    }
  };

  const beginPinch = (touches: readonly any[]) => {
    if (touches.length < 2) return;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    pinchDistance.current = Math.hypot(dx, dy);
    pinchStartZ.current = sceneState.current?.camera.position.z ?? 3;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        baseRot.current = { ...rotation.current };
        beginPinch(event.nativeEvent.touches);
      },
      onPanResponderMove: (event, gestureState) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2 && sceneState.current) {
          if (pinchDistance.current === null) beginPinch(touches);
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const distance = Math.hypot(dx, dy);
          if (pinchDistance.current !== null) {
            const delta = (pinchDistance.current - distance) * 0.01;
            sceneState.current.camera.position.z = THREE.MathUtils.clamp(
              pinchStartZ.current + delta,
              1.2,
              12,
            );
          }
          return;
        }

        pinchDistance.current = null;
        rotation.current.y = baseRot.current.y + gestureState.dx * 0.01;
        rotation.current.x = baseRot.current.x + gestureState.dy * 0.01;
      },
      onPanResponderRelease: () => {
        pinchDistance.current = null;
      },
      onPanResponderTerminate: () => {
        pinchDistance.current = null;
      },
    }),
  ).current;

  useEffect(() => {
    return () => {
      loadIdRef.current += 1;
      if (frameId.current !== null && cancelFrame.current) {
        cancelFrame.current(frameId.current);
      }
      const state = sceneState.current;
      if (state?.modelPivot) disposeObject(state.modelPivot);
      state?.placeholder.geometry.dispose();
      const material = state?.placeholder.material;
      if (material && !Array.isArray(material)) material.dispose();
      state?.renderer.dispose();
    };
  }, []);

  const onContextCreate = (gl: any) => {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const canvas = {
      width,
      height,
      style: {},
      addEventListener() {},
      removeEventListener() {},
      clientWidth: width,
      clientHeight: height,
      getContext: () => gl,
    };

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl,
      antialias: true,
    } as any);
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0a0b, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3;

    const placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.9, 2),
      new THREE.MeshStandardMaterial({
        color: 0xd7dbe0,
        metalness: 0.35,
        roughness: 0.45,
      }),
    );
    scene.add(placeholder);

    const lightRig = new THREE.Group();
    scene.add(lightRig);

    sceneState.current = {
      gl,
      renderer,
      scene,
      camera,
      placeholder,
      lightRig,
      modelPivot: null,
    };
    applyLightPreset(selectedPreset);

    const requestFrame =
      typeof gl.requestAnimationFrame === "function"
        ? gl.requestAnimationFrame.bind(gl)
        : requestAnimationFrame;
    cancelFrame.current =
      typeof gl.cancelAnimationFrame === "function"
        ? gl.cancelAnimationFrame.bind(gl)
        : cancelAnimationFrame;

    const render = () => {
      const target = sceneState.current?.modelPivot ?? placeholder;
      target.rotation.x = rotation.current.x;
      target.rotation.y = rotation.current.y;
      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameId.current = requestFrame(render);
    };
    render();

    const pending = pendingModelRef.current;
    if (pending) {
      pendingModelRef.current = null;
      void loadModel(pending);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.toolbar}>
        <Pressable style={styles.button} onPress={() => void loadModel(SAMPLE_URL)}>
          <Text style={styles.buttonText}>Örnek model</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => void selectModel()}>
          <Text style={styles.buttonText}>GLB seç</Text>
        </Pressable>
      </View>
      <View style={styles.stage} {...panResponder.panHandlers}>
        <GLView ref={glViewRef} style={styles.gl} onContextCreate={onContextCreate} />
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
                value={exportWidth}
                onChangeText={setExportWidth}
                keyboardType="number-pad"
                placeholder="Genişlik"
                placeholderTextColor="#737b86"
              />
              <TextInput
                style={styles.input}
                value={exportHeight}
                onChangeText={setExportHeight}
                keyboardType="number-pad"
                placeholder="Yükseklik"
                placeholderTextColor="#737b86"
              />
              <TextInput
                style={styles.input}
                value={targetKb}
                onChangeText={setTargetKb}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0a0b" },
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
  buttonText: { color: "#f2f4f7", fontSize: 15, fontWeight: "600" },
  stage: { flex: 1 },
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
