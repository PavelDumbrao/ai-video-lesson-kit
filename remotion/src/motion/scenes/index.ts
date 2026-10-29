import React from "react";
import { SceneProps } from "../types";
import { L1_SCENES } from "./l1";

/**
 * Тип сцены (storyboard.json) → компонент. Неизвестный тип рисуется запасным макетом
 * (ключевое слово по центру, караоке внизу). Новый урок N добавляет сюда `...LN_SCENES`
 * (это делает scripts/skeleton.py).
 */
export const SCENES: Record<string, React.FC<SceneProps> | undefined> = {
  // урок 1: Как сделано это видео
  ...L1_SCENES,
};
