import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
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

type SceneState = {
  gl: any;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  placeholder: THREE.Mesh;
  model: THREE.Object3D | null;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) value.dispose();
        });
        material.dispose();
      });
    }
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
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const loadModel = (uri: string) => {
    const state = sceneState.current;
    if (!state) {
      setPendingModel(uri);
      return;
    }

    new GLTFLoader().load(
      uri,
      (gltf) => {
        if (state.model) {
          state.scene.remove(state.model);
          disposeObject(state.model);
        }

        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 2 / maxSize;

        model.scale.setScalar(scale);
        model.position.set(
          -center.x * scale,
          -center.y * scale,
          -center.z * scale,
        );

        state.placeholder.visible = false;
        state.model = model;
        state.scene.add(model);
        state.camera.position.z = THREE.MathUtils.clamp(3.2, 1.2, 12);
        rotation.current = { x: 0, y: 0 };
        baseRot.current = { x: 0, y: 0 };
      },
      undefined,
      () => {
        Alert.alert(
          "3D Nexus",
          "Model yüklenemedi. GLB dosyasını yeniden seçmeyi deneyin.",
        );
      },
    );
  };

  const selectModel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["model/gltf-binary", "model/gltf+json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !/\.(glb|gltf)$/i.test(asset.name)) {
        Alert.alert("3D Nexus", "Lütfen GLB veya GLTF dosyası seçin.");
        return;
      }

      let uri = asset.uri;
      if (uri.startsWith("content://")) {
        const destination =
          FileSystem.cacheDirectory +
          "3d-nexus-" +
          Date.now() +
          (asset.name.toLowerCase().endsWith(".gltf") ? ".gltf" : ".glb");
        await FileSystem.copyAsync({ from: uri, to: destination });
        uri = destination;
      }
      loadModel(uri);
    } catch {
      Alert.alert("3D Nexus", "Dosya seçilirken bir hata oluştu.");
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        baseRot.current = { ...rotation.current };
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          pinchDistance.current = Math.hypot(dx, dy);
          pinchStartZ.current = sceneState.current?.camera.position.z ?? 3;
        }
      },
      onPanResponderMove: (event, gestureState) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2 && sceneState.current) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const distance = Math.hypot(dx, dy);
          if (pinchDistance.current) {
            const delta = (pinchDistance.current - distance) * 0.01;
            sceneState.current.camera.position.z = THREE.MathUtils.clamp(
              pinchStartZ.current + delta,
              1.2,
              12,
            );
          }
          return;
        }

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
      if (frameId.current !== null && cancelFrame.current) {
        cancelFrame.current(frameId.current);
      }
      const state = sceneState.current;
      if (state?.model) disposeObject(state.model);
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
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(3, 4, 5);
    scene.add(directionalLight);

    sceneState.current = {
      gl,
      renderer,
      scene,
      camera,
      placeholder,
      model: null,
    };

    const requestFrame =
      typeof gl.requestAnimationFrame === "function"
        ? gl.requestAnimationFrame.bind(gl)
        : requestAnimationFrame;
    cancelFrame.current =
      typeof gl.cancelAnimationFrame === "function"
        ? gl.cancelAnimationFrame.bind(gl)
        : cancelAnimationFrame;

    const render = () => {
      const target = sceneState.current?.model ?? placeholder;
      target.rotation.x = rotation.current.x;
      target.rotation.y = rotation.current.y;
      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameId.current = requestFrame(render);
    };
    render();

    if (pendingModel) {
      loadModel(pendingModel);
      setPendingModel(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.toolbar}>
        <Pressable style={styles.button} onPress={() => loadModel(SAMPLE_URL)}>
          <Text style={styles.buttonText}>Örnek model</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={selectModel}>
          <Text style={styles.buttonText}>GLB seç</Text>
        </Pressable>
      </View>
      <View style={styles.stage} {...panResponder.panHandlers}>
        <GLView style={styles.gl} onContextCreate={onContextCreate} />
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
});
