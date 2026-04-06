import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Blend, Brush, Check, Copy, Download, Eraser, Grid3X3, PaintBucket, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import { Crosshair } from '../components/Crosshair';
import { PixelIcon } from '../components/PixelIcon';
import { ThemeMode } from '../types';
import { getGradientColor, getThemeAdjustedPalette } from '../utils/colorPalette';
import { downloadPNG, generateSVGString } from '../utils/exportUtils';

type CreatorColorMode = 'solid' | 'gradient';
type CreatorCanvasMode = 'transparent' | 'solid' | 'gradient';
type CreatorTool = 'draw' | 'erase';

const GRID_PRESETS = [8, 12, 16] as const;
type GridPreset = (typeof GRID_PRESETS)[number];

const randomBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const toHex = (value: number) => value.toString(16).padStart(2, '0');

const hslToHex = (h: number, s: number, l: number) => {
  const saturation = s / 100;
  const lightness = l / 100;
  const channel = (n: number) => {
    const k = (n + (h / 30)) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const color = lightness - (a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))));
    return Math.round(255 * color);
  };

  return `#${toHex(channel(0))}${toHex(channel(8))}${toHex(channel(4))}`;
};

const createRandomSolidColor = () =>
  hslToHex(randomBetween(0, 359), randomBetween(66, 95), randomBetween(44, 62));

const createRandomGradientColors = () => {
  const startHue = randomBetween(0, 359);
  const hueOffset = randomBetween(38, 150);
  const endHue = (startHue + hueOffset) % 360;

  return [
    hslToHex(startHue, randomBetween(68, 96), randomBetween(44, 64)),
    hslToHex(endHue, randomBetween(66, 96), randomBetween(44, 64)),
  ] as const;
};

interface CreatorPageProps {
  theme: ThemeMode;
}

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const createEmptyMatrix = (size: number) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => 0));

const resizeMatrix = (matrix: number[][], newSize: number) => {
  const next = createEmptyMatrix(newSize);
  const rowsToCopy = Math.min(matrix.length, newSize);
  const colsToCopy = Math.min(matrix[0]?.length ?? 0, newSize);

  for (let row = 0; row < rowsToCopy; row += 1) {
    for (let col = 0; col < colsToCopy; col += 1) {
      next[row][col] = matrix[row][col];
    }
  }

  return next;
};

const ColorField: React.FC<ColorFieldProps> = ({ id, label, value, onChange }) => (
  <div className="space-y-2">
    <label htmlFor={id} className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)]">
      {label}
    </label>
    <div className="flex items-center gap-3 border border-[color:var(--color-border)] px-3 py-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 cursor-pointer border border-[color:var(--color-border)] bg-transparent p-1"
      />
      <span className="font-mono text-xs tracking-widest uppercase text-[var(--color-text)]">
        {value}
      </span>
    </div>
  </div>
);

export const CreatorPage: React.FC<CreatorPageProps> = ({ theme }) => {
  const [gridSize, setGridSize] = useState<GridPreset>(12);
  const [matrix, setMatrix] = useState<number[][]>(() => createEmptyMatrix(12));
  const [tool, setTool] = useState<CreatorTool>('draw');
  const [iconName, setIconName] = useState('my-icon');
  const [colorMode, setColorMode] = useState<CreatorColorMode>('solid');
  const [canvasMode, setCanvasMode] = useState<CreatorCanvasMode>('transparent');
  const [solidColor, setSolidColor] = useState('#e58a63');
  const [gradientStart, setGradientStart] = useState('#e58a63');
  const [gradientEnd, setGradientEnd] = useState('#4cc9f0');
  const [canvasSolidColor, setCanvasSolidColor] = useState('#111111');
  const [canvasGradientStart, setCanvasGradientStart] = useState('#111111');
  const [canvasGradientEnd, setCanvasGradientEnd] = useState('#2d2d2d');
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const pointerDownRef = useRef(false);

  useEffect(() => {
    const releasePointer = () => {
      pointerDownRef.current = false;
    };

    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('blur', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('blur', releasePointer);
    };
  }, []);

  const renderColors = useMemo(
    () => (colorMode === 'solid'
      ? [solidColor, solidColor, solidColor]
      : [gradientStart, gradientEnd]),
    [colorMode, gradientEnd, gradientStart, solidColor],
  );

  const previewCanvasStyle = useMemo<React.CSSProperties>(() => {
    if (canvasMode === 'solid') {
      return { backgroundColor: canvasSolidColor };
    }

    if (canvasMode === 'gradient') {
      return {
        backgroundImage: `linear-gradient(135deg, ${canvasGradientStart}, ${canvasGradientEnd})`,
      };
    }

    return {};
  }, [canvasGradientEnd, canvasGradientStart, canvasMode, canvasSolidColor]);

  const themedColors = useMemo(
    () => getThemeAdjustedPalette(renderColors, theme),
    [renderColors, theme],
  );

  const gradientPreview = useMemo(
    () => `linear-gradient(130deg, ${themedColors[0]}, ${themedColors[themedColors.length - 1]})`,
    [themedColors],
  );

  const cellSize = useMemo(() => {
    if (gridSize === 8) return 30;
    if (gridSize === 12) return 22;
    return 18;
  }, [gridSize]);

  const previewPixelSize = useMemo(() => {
    if (gridSize === 8) return 18;
    if (gridSize === 12) return 14;
    return 10;
  }, [gridSize]);

  const setCellValue = useCallback((row: number, col: number, value: 0 | 1) => {
    setMatrix((previous) => {
      if (!previous[row] || previous[row][col] === value) return previous;

      const next = previous.map((line, rowIndex) => (rowIndex === row ? [...line] : line));
      next[row][col] = value;
      return next;
    });
  }, []);

  const applyToolAt = useCallback((row: number, col: number) => {
    setCellValue(row, col, tool === 'draw' ? 1 : 0);
  }, [setCellValue, tool]);

  const handlePointerDownCell = useCallback((row: number, col: number) => {
    pointerDownRef.current = true;
    applyToolAt(row, col);
  }, [applyToolAt]);

  const handlePointerEnterCell = useCallback((row: number, col: number) => {
    if (!pointerDownRef.current) return;
    applyToolAt(row, col);
  }, [applyToolAt]);

  const handleGridResize = useCallback((size: GridPreset) => {
    if (size === gridSize) return;
    setGridSize(size);
    setMatrix((previous) => resizeMatrix(previous, size));
  }, [gridSize]);

  const fillAll = useCallback((value: 0 | 1) => {
    setMatrix((previous) => previous.map((row) => row.map(() => value)));
  }, []);

  const invertStructure = useCallback(() => {
    setMatrix((previous) => previous.map((row) => row.map((pixel) => (pixel === 1 ? 0 : 1))));
  }, []);

  const randomizeSolidFill = useCallback(() => {
    setSolidColor(createRandomSolidColor());
  }, []);

  const randomizeGradientFill = useCallback(() => {
    const [nextStart, nextEnd] = createRandomGradientColors();
    setGradientStart(nextStart);
    setGradientEnd(nextEnd);
  }, []);

  const randomizeCurrentFill = useCallback(() => {
    if (colorMode === 'solid') {
      randomizeSolidFill();
      return;
    }

    randomizeGradientFill();
  }, [colorMode, randomizeGradientFill, randomizeSolidFill]);

  const handleCopySvg = useCallback(async () => {
    const svgString = generateSVGString(matrix, renderColors, { theme });
    try {
      await navigator.clipboard.writeText(svgString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [matrix, renderColors, theme]);

  const handleDownloadPng = useCallback(() => {
    const normalizedName = iconName.trim().length > 0 ? iconName.trim() : 'my-icon';
    downloadPNG(matrix, renderColors, normalizedName, { theme });
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1800);
  }, [iconName, matrix, renderColors, theme]);

  return (
    <>
      <div className="border-b border-[color:var(--color-border)] p-6 flex flex-col gap-5 relative bg-[var(--color-surface)] transition-colors">
        <Crosshair className="-bottom-1.5 -left-1.5" />
        <Crosshair className="-bottom-1.5 -right-1.5" />

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] mb-2">
              Pixel Creator
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              Build Your Own Pixel Icon From Scratch
            </h2>
          </div>
          <div className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)]">
            Draw Structure + Set Colors + Export
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 bg-[var(--color-bg)] transition-colors space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] gap-6">
          <section className="relative border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 transition-colors">
            <Crosshair className="-top-1.5 -left-1.5" />
            <Crosshair className="-top-1.5 -right-1.5" />
            <Crosshair className="-bottom-1.5 -left-1.5" />
            <Crosshair className="-bottom-1.5 -right-1.5" />

            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] mr-2">
                Grid Size
              </div>
              {GRID_PRESETS.map((size) => (
                <button
                  key={size}
                  onClick={() => handleGridResize(size)}
                  className={`px-3 py-2 border font-mono text-[10px] tracking-widest uppercase transition-colors ${
                    gridSize === size
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {size}x{size}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                onClick={() => startTransition(() => setTool('draw'))}
                className={`inline-flex items-center gap-2 px-3 py-2 border text-[10px] font-mono tracking-widest uppercase transition-colors ${
                  tool === 'draw'
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                }`}
              >
                <Brush size={12} />
                Draw
              </button>
              <button
                onClick={() => startTransition(() => setTool('erase'))}
                className={`inline-flex items-center gap-2 px-3 py-2 border text-[10px] font-mono tracking-widest uppercase transition-colors ${
                  tool === 'erase'
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                }`}
              >
                <Eraser size={12} />
                Erase
              </button>
              <button
                onClick={() => fillAll(1)}
                className="inline-flex items-center gap-2 px-3 py-2 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <PaintBucket size={12} />
                Fill
              </button>
              <button
                onClick={invertStructure}
                className="inline-flex items-center gap-2 px-3 py-2 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <RefreshCw size={12} />
                Invert
              </button>
              <button
                onClick={() => fillAll(0)}
                className="inline-flex items-center gap-2 px-3 py-2 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <Trash2 size={12} />
                Clear
              </button>
            </div>

            <div className="border border-[color:var(--color-border)] bg-[var(--color-bg)] p-4 overflow-auto">
              <div
                className="inline-grid touch-none"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${gridSize}, ${cellSize}px)`,
                  gap: '2px',
                }}
              >
                {matrix.map((row, rowIdx) => row.map((pixel, colIdx) => {
                  const isOn = pixel === 1;
                  const color = getGradientColor(
                    themedColors,
                    gridSize > 1 ? rowIdx / (gridSize - 1) : 0,
                  );

                  return (
                    <button
                      key={`${rowIdx}-${colIdx}`}
                      type="button"
                      onPointerDown={() => handlePointerDownCell(rowIdx, colIdx)}
                      onPointerEnter={() => handlePointerEnterCell(rowIdx, colIdx)}
                      onPointerUp={() => {
                        pointerDownRef.current = false;
                      }}
                      className={`border transition-colors ${
                        isOn
                          ? 'border-transparent'
                          : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-strong)]'
                      }`}
                      style={{
                        width: `${cellSize}px`,
                        height: `${cellSize}px`,
                        backgroundColor: isOn ? color : 'transparent',
                      }}
                      aria-label={`${isOn ? 'Filled' : 'Empty'} pixel at row ${rowIdx + 1}, column ${colIdx + 1}`}
                    />
                  );
                }))}
              </div>
            </div>
          </section>

          <section className="relative border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 transition-colors">
            <Crosshair className="-top-1.5 -left-1.5" />
            <Crosshair className="-top-1.5 -right-1.5" />
            <Crosshair className="-bottom-1.5 -left-1.5" />
            <Crosshair className="-bottom-1.5 -right-1.5" />

            <div className="space-y-5">
              <div>
                <label htmlFor="creator-icon-name" className="block text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] mb-2">
                  Icon Name
                </label>
                <input
                  id="creator-icon-name"
                  type="text"
                  value={iconName}
                  onChange={(event) => setIconName(event.target.value)}
                  placeholder="MY-ICON"
                  className="w-full bg-transparent border border-[color:var(--color-border)] py-3 px-4 text-xs font-mono tracking-widest text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] transition-all placeholder:text-[var(--color-search-placeholder)] uppercase"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)]">
                  Color Mode
                </div>
                <button
                  onClick={randomizeCurrentFill}
                  className="inline-flex items-center gap-2 py-2 px-3 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[color:var(--color-border-strong)] transition-colors"
                >
                  <Shuffle size={12} />
                  Randomize
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => startTransition(() => setColorMode('solid'))}
                  className={`inline-flex items-center justify-center gap-2 py-2.5 border text-[10px] font-mono tracking-widest uppercase transition-colors ${
                    colorMode === 'solid'
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <Brush size={12} />
                  Solid
                </button>
                <button
                  onClick={() => startTransition(() => setColorMode('gradient'))}
                  className={`inline-flex items-center justify-center gap-2 py-2.5 border text-[10px] font-mono tracking-widest uppercase transition-colors ${
                    colorMode === 'gradient'
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <Blend size={12} />
                  Gradient
                </button>
              </div>

              {colorMode === 'solid' ? (
                <div className="space-y-4">
                  <ColorField
                    id="creator-solid-color"
                    label="Solid Color"
                    value={solidColor}
                    onChange={setSolidColor}
                  />
                  <button
                    onClick={randomizeSolidFill}
                    className="w-full py-2.5 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[color:var(--color-border-strong)] transition-colors"
                  >
                    Randomize Solid
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <ColorField
                    id="creator-gradient-start"
                    label="Gradient Start"
                    value={gradientStart}
                    onChange={setGradientStart}
                  />
                  <ColorField
                    id="creator-gradient-end"
                    label="Gradient End"
                    value={gradientEnd}
                    onChange={setGradientEnd}
                  />
                  <button
                    onClick={randomizeGradientFill}
                    className="w-full py-2.5 border border-[color:var(--color-border)] text-[10px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[color:var(--color-border-strong)] transition-colors"
                  >
                    Randomize Gradient
                  </button>
                </div>
              )}

              <div className="border border-[color:var(--color-border)] p-4">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)] mb-3">
                  <Grid3X3 size={12} />
                  Active Palette
                </div>
                <div className="h-9 border border-[color:var(--color-border)]" style={{ backgroundImage: gradientPreview }} />
              </div>

              <div className="text-[11px] font-mono tracking-widest uppercase text-[var(--color-text-muted)]">
                Preview Background
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => startTransition(() => setCanvasMode('transparent'))}
                  className={`py-2.5 border font-mono text-[10px] tracking-widest uppercase transition-colors ${
                    canvasMode === 'transparent'
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  Transparent
                </button>
                <button
                  onClick={() => startTransition(() => setCanvasMode('solid'))}
                  className={`py-2.5 border font-mono text-[10px] tracking-widest uppercase transition-colors ${
                    canvasMode === 'solid'
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => startTransition(() => setCanvasMode('gradient'))}
                  className={`py-2.5 border font-mono text-[10px] tracking-widest uppercase transition-colors ${
                    canvasMode === 'gradient'
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-transparent text-[var(--color-text-muted)] border-[color:var(--color-border)] hover:text-[var(--color-text)]'
                  }`}
                >
                  Gradient
                </button>
              </div>

              {canvasMode === 'solid' && (
                <ColorField
                  id="creator-canvas-solid"
                  label="Canvas Solid Color"
                  value={canvasSolidColor}
                  onChange={setCanvasSolidColor}
                />
              )}

              {canvasMode === 'gradient' && (
                <div className="space-y-4">
                  <ColorField
                    id="creator-canvas-gradient-start"
                    label="Canvas Gradient Start"
                    value={canvasGradientStart}
                    onChange={setCanvasGradientStart}
                  />
                  <ColorField
                    id="creator-canvas-gradient-end"
                    label="Canvas Gradient End"
                    value={canvasGradientEnd}
                    onChange={setCanvasGradientEnd}
                  />
                </div>
              )}

              <div
                className={`border border-[color:var(--color-border)] min-h-[230px] flex items-center justify-center p-6 relative ${
                  canvasMode === 'transparent' ? 'editor-transparent-canvas' : ''
                }`}
                style={previewCanvasStyle}
              >
                <PixelIcon
                  matrix={matrix}
                  colors={renderColors}
                  size={previewPixelSize}
                  gap={Math.max(1, Math.round(previewPixelSize / 4))}
                  theme={theme}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleCopySvg}
                  className="flex items-center justify-center gap-2 py-3 bg-transparent border border-[color:var(--color-border)] text-[var(--color-text)] font-mono text-xs tracking-widest uppercase hover:bg-[var(--color-hover-surface)] transition-colors"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy SVG'}
                </button>
                <button
                  onClick={handleDownloadPng}
                  className="flex items-center justify-center gap-2 py-3 bg-[var(--color-accent)] text-[var(--color-accent-contrast)] font-mono text-xs tracking-widest uppercase hover:bg-[var(--color-accent-strong)] transition-colors"
                >
                  {downloaded ? <Check size={16} /> : <Download size={16} />}
                  {downloaded ? 'Saved!' : 'Download PNG'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
