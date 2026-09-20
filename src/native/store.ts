import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ExportFormat } from "./exportImage";

export type StoredModel =
  | null
  | { kind: "sample" }
  | { kind: "local"; uri: string };

export type GalleryItem = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  format: ExportFormat;
  createdAt: number;
};

type StudioState = {
  selectedPreset: string;
  exportFormat: ExportFormat;
  exportQuality: number;
  exportWidth: number;
  exportHeight: number;
  targetKb: number | null;
  rotation: { x: number; y: number };
  cameraZ: number;
  lastModel: StoredModel;
  tourDone: boolean;
  tourStep: number;
  gallery: GalleryItem[];
  setSelectedPreset: (value: string) => void;
  setExportFormat: (value: ExportFormat) => void;
  setExportQuality: (value: number) => void;
  setExportWidth: (value: number) => void;
  setExportHeight: (value: number) => void;
  setTargetKb: (value: number | null) => void;
  setRotation: (value: { x: number; y: number }) => void;
  setCameraZ: (value: number) => void;
  setLastModel: (value: StoredModel) => void;
  setTourDone: (value: boolean) => void;
  setTourStep: (value: number) => void;
  addGalleryItem: (item: GalleryItem) => void;
  setGallery: (items: GalleryItem[]) => void;
};

const safeStorage = {
  getItem: async (name: string) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // Persist hatası uygulamayı kapatmamalı.
    }
  },
  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // Varsayılan state kullanılmaya devam eder.
    }
  },
};

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      selectedPreset: "Ürün",
      exportFormat: "png",
      exportQuality: 90,
      exportWidth: 1920,
      exportHeight: 1080,
      targetKb: null,
      rotation: { x: 0, y: 0 },
      cameraZ: 3,
      lastModel: null,
      tourDone: false,
      tourStep: 0,
      gallery: [],
      setSelectedPreset: (selectedPreset) => set({ selectedPreset }),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      setExportQuality: (exportQuality) => set({ exportQuality }),
      setExportWidth: (exportWidth) => set({ exportWidth }),
      setExportHeight: (exportHeight) => set({ exportHeight }),
      setTargetKb: (targetKb) => set({ targetKb }),
      setRotation: (rotation) => set({ rotation }),
      setCameraZ: (cameraZ) => set({ cameraZ }),
      setLastModel: (lastModel) => set({ lastModel }),
      setTourDone: (tourDone) => set({ tourDone }),
      setTourStep: (tourStep) => set({ tourStep }),
      addGalleryItem: (item) =>
        set((state) => ({ gallery: [item, ...state.gallery].slice(0, 50) })),
      setGallery: (gallery) => set({ gallery: gallery.slice(0, 50) }),
    }),
    {
      name: "3d-nexus-studio",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        selectedPreset: state.selectedPreset,
        exportFormat: state.exportFormat,
        exportQuality: state.exportQuality,
        exportWidth: state.exportWidth,
        exportHeight: state.exportHeight,
        targetKb: state.targetKb,
        rotation: state.rotation,
        cameraZ: state.cameraZ,
        lastModel: state.lastModel,
        tourDone: state.tourDone,
        tourStep: state.tourStep,
        gallery: state.gallery,
      }),
    },
  ),
);
