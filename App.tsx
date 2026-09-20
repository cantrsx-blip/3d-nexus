import { useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { PanResponder, StyleSheet, View } from "react-native";

export default function App() {
  const rotation = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        rotation.current.y = gestureState.dx * 0.01;
        rotation.current.x = gestureState.dy * 0.01;
      },
    }),
  ).current;

  const onContextCreate = (gl: any) => {
    const renderer = new THREE.WebGLRenderer({
      context: gl,
      antialias: true,
    } as any);

    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x0a0a0b, 1);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      100,
    );
    camera.position.z = 3;

    const geometry = new THREE.IcosahedronGeometry(0.9, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd7dbe0,
      metalness: 0.35,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(3, 4, 5);
    scene.add(directionalLight);

    let frameId = 0;

    const render = () => {
      mesh.rotation.x = rotation.current.x;
      mesh.rotation.y = rotation.current.y;

      renderer.render(scene, camera);
      gl.endFrameEXP();

      const requestFrame =
        typeof gl.requestAnimationFrame === "function"
          ? gl.requestAnimationFrame.bind(gl)
          : requestAnimationFrame;

      frameId = requestFrame(render);
    };

    render();

    return () => {
      if (typeof gl.cancelAnimationFrame === "function") {
        gl.cancelAnimationFrame(frameId);
      } else {
        cancelAnimationFrame(frameId);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar style="light" />
      <GLView style={styles.gl} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0b",
  },
  gl: {
    flex: 1,
  },
});
