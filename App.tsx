import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { PanResponder, StyleSheet, View } from "react-native";

export default function App() {
  const rotation = useRef({ x: 0, y: 0 });
  const baseRot = useRef({ x: 0, y: 0 });
  const frameId = useRef<number | null>(null);
  const cancelFrame = useRef<((id: number) => void) | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.Material | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        baseRot.current = { ...rotation.current };
      },
      onPanResponderMove: (_, gestureState) => {
        rotation.current.y = baseRot.current.y + gestureState.dx * 0.01;
        rotation.current.x = baseRot.current.x + gestureState.dy * 0.01;
      },
    }),
  ).current;

  useEffect(() => {
    return () => {
      if (frameId.current !== null && cancelFrame.current) {
        cancelFrame.current(frameId.current);
      }
      geometryRef.current?.dispose();
      materialRef.current?.dispose();
      rendererRef.current?.dispose();
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
    rendererRef.current = renderer;

    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0a0b, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3;

    const geometry = new THREE.IcosahedronGeometry(0.9, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd7dbe0,
      metalness: 0.35,
      roughness: 0.45,
    });
    geometryRef.current = geometry;
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(3, 4, 5);
    scene.add(directionalLight);

    const requestFrame =
      typeof gl.requestAnimationFrame === "function"
        ? gl.requestAnimationFrame.bind(gl)
        : requestAnimationFrame;
    cancelFrame.current =
      typeof gl.cancelAnimationFrame === "function"
        ? gl.cancelAnimationFrame.bind(gl)
        : cancelAnimationFrame;

    const render = () => {
      mesh.rotation.x = rotation.current.x;
      mesh.rotation.y = rotation.current.y;
      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameId.current = requestFrame(render);
    };

    render();
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar style="light" />
      <GLView style={styles.gl} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0b" },
  gl: { flex: 1 },
});
