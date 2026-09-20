import { useEffect, useRef } from "react";
import { GLView } from "expo-gl";
import * as THREE from "three";
import { StyleSheet } from "react-native";

type Props = {
  rotation: { x: number; y: number };
  cameraZ: number;
  onError: (message: string) => void;
  onReady?: (api: { glView: GLView | null; camera: THREE.PerspectiveCamera }) => void;
};

export default function SceneCanvas({ rotation, cameraZ, onError, onReady }: Props) {
  const viewRef = useRef<GLView | null>(null);
  const frameRef = useRef<number | null>(null);
  const cancelRef = useRef<((id: number) => void) | null>(null);

  useEffect(() => () => {
    if (frameRef.current !== null && cancelRef.current) {
      cancelRef.current(frameRef.current);
    }
  }, []);

  const onContextCreate = (gl: any) => {
    try {
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
      camera.position.z = Math.min(12, Math.max(1.2, cameraZ));

      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.9, 2),
        new THREE.MeshStandardMaterial({
          color: 0xd7dbe0,
          metalness: 0.35,
          roughness: 0.45,
        }),
      );
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(3, 4, 5);
      scene.add(key);

      const requestFrame =
        typeof gl.requestAnimationFrame === "function"
          ? gl.requestAnimationFrame.bind(gl)
          : requestAnimationFrame;
      cancelRef.current =
        typeof gl.cancelAnimationFrame === "function"
          ? gl.cancelAnimationFrame.bind(gl)
          : cancelAnimationFrame;

      onReady?.({ glView: viewRef.current, camera });

      const render = () => {
        try {
          mesh.rotation.x = rotation.x;
          mesh.rotation.y = rotation.y;
          renderer.render(scene, camera);
          gl.endFrameEXP();
          frameRef.current = requestFrame(render);
        } catch {
          onError("3D sahne açılamadı");
        }
      };
      render();
    } catch {
      onError("3D sahne açılamadı");
    }
  };

  return <GLView ref={viewRef} style={styles.gl} onContextCreate={onContextCreate} />;
}

const styles = StyleSheet.create({ gl: { flex: 1 } });
