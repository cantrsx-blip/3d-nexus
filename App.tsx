import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { exportSceneImage, type ExportOptions } from "./src/native/exportImage";
import {
  Alert,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
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
