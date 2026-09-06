/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import { FlipType, manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator'
import { Check, FlipHorizontal2, PenLine, RotateCcw, RotateCw, Scissors, Type, Undo2, X } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import ViewShot from 'react-native-view-shot'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import type { MediaAttachment } from '@/lib/types'
import {
  createEditedImageAttachment,
  deleteEditedImageUris,
  type EditedImageFormat,
} from '@/services/media'

type EditorTool = 'draw' | 'text' | 'crop'
type CropHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

type DrawPath = {
  id: string
  color: string
  width: number
  d: string
}

type TextOverlay = {
  id: string
  text: string
  x: number
  y: number
}

type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

type EditorSnapshot = {
  uri: string
  width: number
  height: number
  paths: DrawPath[]
  textOverlays: TextOverlay[]
}

interface ImageEditorModalProps {
  visible: boolean
  attachment: MediaAttachment | null
  title?: string
  onCancel: () => void
  onUseOriginal?: (attachment: MediaAttachment) => void
  onSave: (attachment: MediaAttachment) => void | Promise<void>
}

const DRAW_COLORS = ['#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7'] as const
const DRAW_WIDTHS = [3, 6, 10] as const
const MAX_EXPORT_EDGE = 1600
const MIN_CROP_SIZE = 56

function isPngMimeType(mimeType?: string | null): boolean {
  return (mimeType || '').toLowerCase() === 'image/png'
}

function getSaveFormat(mimeType?: string | null): SaveFormat {
  return isPngMimeType(mimeType) ? SaveFormat.PNG : SaveFormat.JPEG
}

function getEditedImageFormat(format: SaveFormat): EditedImageFormat {
  return format === SaveFormat.PNG ? 'png' : 'jpeg'
}

function getExportDimensions(width: number, height: number): { width: number; height: number } {
  const maxEdge = Math.max(width, height)
  if (!Number.isFinite(maxEdge) || maxEdge <= 0 || maxEdge <= MAX_EXPORT_EDGE) {
    return { width, height }
  }

  const scale = MAX_EXPORT_EDGE / maxEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function ImageEditorModal({
  visible,
  attachment,
  title,
  onCancel,
  onUseOriginal,
  onSave,
}: ImageEditorModalProps) {
  const colors = useThemeColors()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const viewShotRef = useRef<ViewShot>(null)
  const [currentUri, setCurrentUri] = useState('')
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [paths, setPaths] = useState<DrawPath[]>([])
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [tool, setTool] = useState<EditorTool>('draw')
  const [drawColor, setDrawColor] = useState<(typeof DRAW_COLORS)[number]>('#ffffff')
  const [drawWidth, setDrawWidth] = useState<(typeof DRAW_WIDTHS)[number]>(6)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [textDraft, setTextDraft] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [history, setHistory] = useState<EditorSnapshot[]>([])
  const [generatedUris, setGeneratedUris] = useState<string[]>([])
  const activePathIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!visible || !attachment) {
      setCurrentUri('')
      setPaths([])
      setTextOverlays([])
      setTextDraft('')
      setCropRect(null)
      setDrawColor('#ffffff')
      setDrawWidth(6)
      setHistory([])
      setGeneratedUris([])
      activePathIdRef.current = null
      return
    }

    setCurrentUri(attachment.uri)
    setImageSize({
      width: attachment.width || 1,
      height: attachment.height || 1,
    })
    setPaths([])
    setTextOverlays([])
    setTextDraft('')
    setTool('draw')
    setCropRect(null)
    setDrawColor('#ffffff')
    setDrawWidth(6)
    setHistory([])
    setGeneratedUris([])
    activePathIdRef.current = null
  }, [attachment, visible])

  useEffect(() => {
    if (visible || generatedUris.length === 0) {
      return
    }

    void deleteEditedImageUris(generatedUris)
    setGeneratedUris([])
  }, [generatedUris, visible])

  const editorFrame = useMemo(() => {
    const maxWidth = windowWidth - 24
    const maxHeight = Math.max(260, windowHeight * 0.58)
    const aspectRatio = imageSize.width / imageSize.height || 1
    let width = maxWidth
    let height = width / aspectRatio

    if (height > maxHeight) {
      height = maxHeight
      width = height * aspectRatio
    }

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    }
  }, [imageSize.height, imageSize.width, windowHeight, windowWidth])
  const captureFrame = useMemo(
    () => getExportDimensions(imageSize.width, imageSize.height),
    [imageSize.height, imageSize.width],
  )

  const pushHistory = useCallback(() => {
    setHistory((current) => [
      ...current,
      {
        uri: currentUri,
        width: imageSize.width,
        height: imageSize.height,
        paths,
        textOverlays,
      },
    ])
  }, [currentUri, imageSize.height, imageSize.width, paths, textOverlays])

  const restoreSnapshot = useCallback((snapshot: EditorSnapshot) => {
    setCurrentUri(snapshot.uri)
    setImageSize({ width: snapshot.width, height: snapshot.height })
    setPaths(snapshot.paths)
    setTextOverlays(snapshot.textOverlays)
    setCropRect(null)
  }, [])

  const handleUndo = useCallback(() => {
    setHistory((current) => {
      const snapshot = current[current.length - 1]
      if (!snapshot) {
        return current
      }

      restoreSnapshot(snapshot)
      return current.slice(0, -1)
    })
  }, [restoreSnapshot])

  const handleReset = useCallback(() => {
    if (!attachment) return
    pushHistory()
    setCurrentUri(attachment.uri)
    setImageSize({
      width: attachment.width || 1,
      height: attachment.height || 1,
    })
    setPaths([])
    setTextOverlays([])
    setCropRect(null)
  }, [attachment, pushHistory])

  const applyImageAction = useCallback(async (
    action: Action,
    nextSize?: { width: number; height: number },
  ) => {
    if (!currentUri) return

    try {
      pushHistory()
      setIsProcessing(true)
      const format = getSaveFormat(attachment?.mimeType)
      const result = await manipulateAsync(currentUri, [action], {
        compress: 0.92,
        format,
      })
      setCurrentUri(result.uri)
      setGeneratedUris((current) => [...current, result.uri])
      setImageSize(nextSize ?? { width: result.width, height: result.height })
      setPaths([])
      setTextOverlays([])
      setCropRect(null)
      setTool('draw')
    } catch (error) {
      console.warn('[ImageEditor] Failed to transform image:', error)
      Alert.alert(translate('Edit failed'), translate('Could not update this image. Please try again.'))
    } finally {
      setIsProcessing(false)
    }
  }, [attachment?.mimeType, currentUri, pushHistory])

  const handleRotate = useCallback(() => {
    void applyImageAction(
      { rotate: 90 },
      { width: imageSize.height, height: imageSize.width },
    )
  }, [applyImageAction, imageSize.height, imageSize.width])

  const handleFlip = useCallback(() => {
    void applyImageAction({ flip: FlipType.Horizontal })
  }, [applyImageAction])

  const openCropTool = useCallback(() => {
    const width = Math.max(MIN_CROP_SIZE, editorFrame.width * 0.78)
    const height = Math.max(MIN_CROP_SIZE, editorFrame.height * 0.78)
    setCropRect({
      x: Math.max(0, (editorFrame.width - width) / 2),
      y: Math.max(0, (editorFrame.height - height) / 2),
      width: Math.min(width, editorFrame.width),
      height: Math.min(height, editorFrame.height),
    })
    setTool('crop')
  }, [editorFrame.height, editorFrame.width])

  const cancelCrop = useCallback(() => {
    setCropRect(null)
    setTool('draw')
  }, [])

  const applyCrop = useCallback(() => {
    if (!cropRect) return

    const scaleX = imageSize.width / editorFrame.width
    const scaleY = imageSize.height / editorFrame.height
    const originX = Math.max(0, Math.round(cropRect.x * scaleX))
    const originY = Math.max(0, Math.round(cropRect.y * scaleY))
    const width = Math.min(imageSize.width - originX, Math.max(1, Math.round(cropRect.width * scaleX)))
    const height = Math.min(imageSize.height - originY, Math.max(1, Math.round(cropRect.height * scaleY)))

    void applyImageAction(
      {
        crop: {
          originX,
          originY,
          width,
          height,
        },
      },
      { width, height },
    )
  }, [applyImageAction, cropRect, editorFrame.height, editorFrame.width, imageSize.height, imageSize.width])

  const addTextOverlay = useCallback(() => {
    const trimmed = textDraft.trim()
    if (!trimmed) return

    pushHistory()
    setTextOverlays((current) => [
      ...current,
      {
        id: `text_${Date.now()}`,
        text: trimmed,
        x: editorFrame.width / 2,
        y: editorFrame.height / 2,
      },
    ])
    setTextDraft('')
  }, [editorFrame.height, editorFrame.width, pushHistory, textDraft])

  const updateTextOverlayPosition = useCallback((id: string, x: number, y: number) => {
    setTextOverlays((current) => current.map((overlay) => (
      overlay.id === id
        ? {
            ...overlay,
            x: Math.min(editorFrame.width, Math.max(0, x)),
            y: Math.min(editorFrame.height, Math.max(0, y)),
          }
        : overlay
    )))
  }, [editorFrame.height, editorFrame.width])

  const appendPointToActivePath = useCallback((x: number, y: number) => {
    const activePathId = activePathIdRef.current
    if (!activePathId) return

    setPaths((current) => current.map((path) => (
      path.id === activePathId
        ? { ...path, d: `${path.d} L ${x.toFixed(1)} ${y.toFixed(1)}` }
        : path
    )))
  }, [])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => tool === 'draw' && !isProcessing,
    onMoveShouldSetPanResponder: () => tool === 'draw' && !isProcessing,
    onPanResponderGrant: (event) => {
      if (tool !== 'draw') return
      const { locationX, locationY } = event.nativeEvent
      pushHistory()
      const id = `path_${Date.now()}`
      activePathIdRef.current = id
      setPaths((current) => [
        ...current,
        {
          id,
          color: drawColor,
          width: drawWidth,
          d: `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`,
        },
      ])
    },
    onPanResponderMove: (event) => {
      const { locationX, locationY } = event.nativeEvent
      appendPointToActivePath(locationX, locationY)
    },
    onPanResponderRelease: () => {
      activePathIdRef.current = null
    },
    onPanResponderTerminate: () => {
      activePathIdRef.current = null
    },
  }), [appendPointToActivePath, drawColor, drawWidth, isProcessing, pushHistory, tool])

  const handleSave = useCallback(async () => {
    if (!attachment || !currentUri || isProcessing) return

    let capturedUri: string | undefined
    let normalizedUri: string | undefined

    try {
      setIsProcessing(true)
      const format = getSaveFormat(attachment.mimeType)
      const exportDimensions = getExportDimensions(imageSize.width, imageSize.height)
      capturedUri = await viewShotRef.current?.capture?.()
      if (!capturedUri) {
        throw new Error('Image editor capture did not return a URI')
      }

      const normalized = await manipulateAsync(
        capturedUri,
        [{ resize: exportDimensions }],
        {
          compress: 0.92,
          format,
        },
      )
      normalizedUri = normalized.uri
      const editedAttachment = await createEditedImageAttachment(attachment, {
        uri: normalized.uri,
        width: normalized.width,
        height: normalized.height,
        format: getEditedImageFormat(format),
      })

      await deleteEditedImageUris([...generatedUris, capturedUri, normalizedUri])
      setGeneratedUris([])
      await onSave(editedAttachment)
    } catch (error) {
      console.warn('[ImageEditor] Failed to save image:', error)
      Alert.alert(translate('Save failed'), translate('Could not save the edited image. Please try again.'))
    } finally {
      setIsProcessing(false)
    }
  }, [attachment, currentUri, generatedUris, imageSize.height, imageSize.width, isProcessing, onSave])

  const cleanupAndCancel = useCallback(() => {
    void deleteEditedImageUris(generatedUris)
    setGeneratedUris([])
    onCancel()
  }, [generatedUris, onCancel])

  const handleUseOriginal = useCallback(() => {
    if (!attachment) return
    void deleteEditedImageUris(generatedUris)
    setGeneratedUris([])
    onUseOriginal?.(attachment)
  }, [attachment, generatedUris, onUseOriginal])

  const canSave = Boolean(attachment && currentUri) && !isProcessing && tool !== 'crop'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={cleanupAndCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-black">
        <View className="flex-row items-center justify-between px-4 pt-14 pb-3">
          <Pressable onPress={cleanupAndCancel} className="w-10 h-10 rounded-full items-center justify-center bg-white/14">
            <X size={22} color="white" />
          </Pressable>
          <Text className="text-white text-base font-semibold" numberOfLines={1}>
            {title || translate('Edit image')}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: canSave ? colors.primary : 'rgba(255,255,255,0.14)' }}
          >
            {isProcessing ? <ActivityIndicator size="small" color="white" /> : <Check size={22} color="white" />}
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-3">
          <View style={{ width: editorFrame.width, height: editorFrame.height }}>
            <ViewShot
              ref={viewShotRef}
              options={{
                format: isPngMimeType(attachment?.mimeType) ? 'png' : 'jpg',
                quality: 0.92,
                result: 'tmpfile',
                width: captureFrame.width,
                height: captureFrame.height,
              }}
            >
              <View
                className="overflow-hidden bg-black"
                style={{ width: editorFrame.width, height: editorFrame.height }}
                {...panResponder.panHandlers}
              >
                {currentUri ? (
                  <Image
                    source={{ uri: currentUri }}
                    style={{ width: editorFrame.width, height: editorFrame.height }}
                    contentFit="cover"
                    cachePolicy="disk"
                    recyclingKey={currentUri}
                  />
                ) : null}
                <Svg
                  pointerEvents="none"
                  width={editorFrame.width}
                  height={editorFrame.height}
                  style={{ position: 'absolute', left: 0, top: 0 }}
                >
                  {paths.map((path) => (
                    <Path
                      key={path.id}
                      d={path.d}
                      stroke={path.color}
                      strokeWidth={path.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                </Svg>
                {textOverlays.map((overlay) => (
                  <DraggableTextOverlay
                    key={overlay.id}
                    overlay={overlay}
                    editorFrame={editorFrame}
                    draggable={tool === 'text' && !isProcessing}
                    onDragStart={pushHistory}
                    onDrag={updateTextOverlayPosition}
                  />
                ))}
              </View>
            </ViewShot>
            {tool === 'crop' && cropRect ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: editorFrame.width,
                  height: editorFrame.height,
                }}
              >
                <CropOverlay
                  rect={cropRect}
                  editorFrame={editorFrame}
                  onChange={setCropRect}
                />
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-4 pb-8 pt-3 gap-3" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
          {tool === 'text' ? (
            <>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={textDraft}
                  onChangeText={setTextDraft}
                  placeholder={translate('Add text')}
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  className="flex-1 rounded-2xl px-4 py-3 text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                  autoFocus
                  maxLength={80}
                />
                <Pressable
                  onPress={addTextOverlay}
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-white font-semibold">{translate('Add')}</Text>
                </Pressable>
              </View>
              {textOverlays.length > 0 ? (
                <Text className="text-white/60 text-xs">
                  {translate('Drag text on the image to reposition it.')}
                </Text>
              ) : null}
            </>
          ) : null}

          {tool === 'crop' ? (
            <View className="gap-2">
              <Text className="text-white/60 text-xs">
                {translate('Drag the crop frame or its corners, then apply.')}
              </Text>
              <View className="flex-row items-center justify-end gap-2">
                <Pressable
                  onPress={cancelCrop}
                  className="rounded-2xl px-4 py-3 bg-white/10"
                  disabled={isProcessing}
                >
                  <Text className="text-white font-semibold">{translate('Cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={applyCrop}
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: colors.primary, opacity: isProcessing ? 0.45 : 1 }}
                  disabled={isProcessing}
                >
                  <Text className="text-white font-semibold">{translate('Apply crop')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {tool === 'draw' ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-white/60 text-xs">{translate('Color')}</Text>
                <View className="flex-row items-center gap-2">
                  {DRAW_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setDrawColor(color)}
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: color,
                        borderWidth: drawColor === color ? 3 : 1,
                        borderColor: drawColor === color ? colors.primary : 'rgba(255,255,255,0.35)',
                      }}
                      accessibilityLabel={translate('Select drawing color')}
                    />
                  ))}
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-white/60 text-xs">{translate('Stroke')}</Text>
                <View className="flex-row items-center gap-2">
                  {DRAW_WIDTHS.map((width) => (
                    <Pressable
                      key={width}
                      onPress={() => setDrawWidth(width)}
                      className="rounded-2xl px-3 py-2"
                      style={{ backgroundColor: drawWidth === width ? colors.primary : 'rgba(255,255,255,0.12)' }}
                    >
                      <Text className="text-white font-semibold text-xs">{width}px</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          <View className="flex-row items-center justify-between">
            <EditorButton
              label={translate('Crop')}
              icon={<Scissors size={19} color={tool === 'crop' ? colors.primary : 'white'} />}
              onPress={openCropTool}
              active={tool === 'crop'}
              disabled={isProcessing}
            />
            <EditorButton label={translate('Rotate')} icon={<RotateCw size={19} color="white" />} onPress={handleRotate} disabled={isProcessing} />
            <EditorButton label={translate('Flip')} icon={<FlipHorizontal2 size={19} color="white" />} onPress={handleFlip} disabled={isProcessing} />
            <EditorButton
              label={translate('Draw')}
              icon={<PenLine size={19} color={tool === 'draw' ? colors.primary : 'white'} />}
              onPress={() => setTool('draw')}
              active={tool === 'draw'}
              disabled={isProcessing}
            />
            <EditorButton
              label={translate('Text')}
              icon={<Type size={19} color={tool === 'text' ? colors.primary : 'white'} />}
              onPress={() => setTool('text')}
              active={tool === 'text'}
              disabled={isProcessing}
            />
          </View>

          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={handleUndo}
              disabled={history.length === 0 || isProcessing}
              className="flex-row items-center gap-2 rounded-2xl px-4 py-3 bg-white/10"
              style={{ opacity: history.length === 0 || isProcessing ? 0.45 : 1 }}
            >
              <Undo2 size={18} color="white" />
              <Text className="text-white font-semibold">{translate('Undo')}</Text>
            </Pressable>
            <Pressable
              onPress={handleReset}
              disabled={isProcessing}
              className="flex-row items-center gap-2 rounded-2xl px-4 py-3 bg-white/10"
            >
              <RotateCcw size={18} color="white" />
              <Text className="text-white font-semibold">{translate('Reset')}</Text>
            </Pressable>
            {onUseOriginal ? (
              <Pressable
                onPress={handleUseOriginal}
                disabled={isProcessing}
                className="rounded-2xl px-4 py-3 bg-white/10"
              >
                <Text className="text-white font-semibold">{translate('Use original')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

function EditorButton({
  label,
  icon,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
  active?: boolean
  disabled?: boolean
}) {
  const colors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className="items-center gap-1"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center"
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)' }}
      >
        {icon}
      </View>
      <Text className="text-[11px]" style={{ color: active ? colors.primary : 'rgba(255,255,255,0.72)' }}>
        {label}
      </Text>
    </Pressable>
  )
}

function DraggableTextOverlay({
  overlay,
  editorFrame,
  draggable,
  onDragStart,
  onDrag,
}: {
  overlay: TextOverlay
  editorFrame: { width: number; height: number }
  draggable: boolean
  onDragStart: () => void
  onDrag: (id: string, x: number, y: number) => void
}) {
  // Overlay coordinates track the visual center.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const latestRef = useRef({ x: overlay.x, y: overlay.y })
  const startRef = useRef({ x: overlay.x, y: overlay.y })

  latestRef.current = { x: overlay.x, y: overlay.y }

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (width !== size.width || height !== size.height) {
      setSize({ width, height })
    }
  }, [size.height, size.width])

  const dragGesture = useMemo(() => Gesture.Pan()
    .enabled(draggable)
    .runOnJS(true)
    .minDistance(2)
    .onBegin(() => {
      startRef.current = latestRef.current
      onDragStart()
    })
    .onUpdate((event) => {
      onDrag(
        overlay.id,
        startRef.current.x + event.translationX,
        startRef.current.y + event.translationY,
      )
    })
    .onEnd((event) => {
      onDrag(
        overlay.id,
        startRef.current.x + event.translationX,
        startRef.current.y + event.translationY,
      )
    }), [draggable, onDrag, onDragStart, overlay.id])

  const halfWidth = size.width > 0 ? size.width / 2 : 0
  const halfHeight = size.height > 0 ? size.height / 2 : 0
  const minLeft = Math.max(0, halfWidth)
  const maxLeft = Math.max(minLeft, editorFrame.width - halfWidth)
  const minTop = Math.max(0, halfHeight)
  const maxTop = Math.max(minTop, editorFrame.height - halfHeight)
  const centeredX = Math.min(maxLeft, Math.max(minLeft, overlay.x)) - halfWidth
  const centeredY = Math.min(maxTop, Math.max(minTop, overlay.y)) - halfHeight

  return (
    <GestureDetector gesture={dragGesture}>
      <View
        pointerEvents={draggable ? 'auto' : 'none'}
        onLayout={handleLayout}
        accessibilityLabel={translate('Text overlay', { ns: 'chat' })}
        className="absolute rounded-xl bg-black/45 px-3 py-1"
        style={{
          left: centeredX,
          top: centeredY,
          maxWidth: Math.max(120, editorFrame.width - 16),
        }}
      >
        <Text className="text-white text-xl font-bold text-center">
          {overlay.text}
        </Text>
      </View>
    </GestureDetector>
  )
}

function constrainCropRect(rect: CropRect, editorFrame: { width: number; height: number }): CropRect {
  const width = Math.min(editorFrame.width, Math.max(MIN_CROP_SIZE, rect.width))
  const height = Math.min(editorFrame.height, Math.max(MIN_CROP_SIZE, rect.height))

  return {
    x: Math.min(editorFrame.width - width, Math.max(0, rect.x)),
    y: Math.min(editorFrame.height - height, Math.max(0, rect.y)),
    width,
    height,
  }
}

function resizeCropRect(
  startRect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  editorFrame: { width: number; height: number },
): CropRect {
  let next = { ...startRect }

  if (handle === 'topLeft' || handle === 'bottomLeft') {
    next.x = startRect.x + dx
    next.width = startRect.width - dx
    if (next.width < MIN_CROP_SIZE) {
      next.x = startRect.x + startRect.width - MIN_CROP_SIZE
      next.width = MIN_CROP_SIZE
    }
  } else {
    next.width = startRect.width + dx
  }

  if (handle === 'topLeft' || handle === 'topRight') {
    next.y = startRect.y + dy
    next.height = startRect.height - dy
    if (next.height < MIN_CROP_SIZE) {
      next.y = startRect.y + startRect.height - MIN_CROP_SIZE
      next.height = MIN_CROP_SIZE
    }
  } else {
    next.height = startRect.height + dy
  }

  return constrainCropRect(next, editorFrame)
}

const HANDLE_SIZE = 32
const HANDLE_HIT_SLOP = 16

function CropOverlay({
  rect,
  editorFrame,
  onChange,
}: {
  rect: CropRect
  editorFrame: { width: number; height: number }
  onChange: (rect: CropRect) => void
}) {
  // Keep gestures stable during active drags.
  const latestRef = useRef(rect)
  latestRef.current = rect

  const moveStartRef = useRef(rect)
  const handleStartRefs = useRef<Record<CropHandle, CropRect>>({
    topLeft: rect,
    topRight: rect,
    bottomLeft: rect,
    bottomRight: rect,
  })

  const moveGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onBegin(() => {
      moveStartRef.current = latestRef.current
    })
    .onUpdate((event) => {
      onChange(constrainCropRect({
        ...moveStartRef.current,
        x: moveStartRef.current.x + event.translationX,
        y: moveStartRef.current.y + event.translationY,
      }, editorFrame))
    }), [editorFrame, onChange])

  const buildHandleGesture = (handle: CropHandle) => Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onBegin(() => {
      handleStartRefs.current[handle] = latestRef.current
    })
    .onUpdate((event) => {
      onChange(resizeCropRect(
        handleStartRefs.current[handle],
        handle,
        event.translationX,
        event.translationY,
        editorFrame,
      ))
    })

  const topLeftGesture = useMemo(() => buildHandleGesture('topLeft'), [editorFrame, onChange])
  const topRightGesture = useMemo(() => buildHandleGesture('topRight'), [editorFrame, onChange])
  const bottomLeftGesture = useMemo(() => buildHandleGesture('bottomLeft'), [editorFrame, onChange])
  const bottomRightGesture = useMemo(() => buildHandleGesture('bottomRight'), [editorFrame, onChange])

  const handleOffset = HANDLE_SIZE / 2
  const handleHitSlop = { top: HANDLE_HIT_SLOP, bottom: HANDLE_HIT_SLOP, left: HANDLE_HIT_SLOP, right: HANDLE_HIT_SLOP }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, top: 0, width: editorFrame.width, height: editorFrame.height }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, rect.y), backgroundColor: 'rgba(0,0,0,0.48)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: rect.y + rect.height, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.48)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.height, backgroundColor: 'rgba(0,0,0,0.48)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: rect.x + rect.width, top: rect.y, right: 0, height: rect.height, backgroundColor: 'rgba(0,0,0,0.48)' }} />

      <GestureDetector gesture={moveGesture}>
        <View
          accessibilityLabel={translate('Crop frame', { ns: 'chat' })}
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            borderWidth: 2,
            borderColor: 'white',
            backgroundColor: 'transparent',
          }}
        />
      </GestureDetector>

      <GestureDetector gesture={topLeftGesture}>
        <View
          accessibilityLabel={translate('Crop top-left handle', { ns: 'chat' })}
          hitSlop={handleHitSlop}
          style={{
            position: 'absolute',
            left: rect.x - handleOffset,
            top: rect.y - handleOffset,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: HANDLE_SIZE / 2,
            backgroundColor: 'white',
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.6)',
          }}
        />
      </GestureDetector>
      <GestureDetector gesture={topRightGesture}>
        <View
          accessibilityLabel={translate('Crop top-right handle', { ns: 'chat' })}
          hitSlop={handleHitSlop}
          style={{
            position: 'absolute',
            left: rect.x + rect.width - handleOffset,
            top: rect.y - handleOffset,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: HANDLE_SIZE / 2,
            backgroundColor: 'white',
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.6)',
          }}
        />
      </GestureDetector>
      <GestureDetector gesture={bottomLeftGesture}>
        <View
          accessibilityLabel={translate('Crop bottom-left handle', { ns: 'chat' })}
          hitSlop={handleHitSlop}
          style={{
            position: 'absolute',
            left: rect.x - handleOffset,
            top: rect.y + rect.height - handleOffset,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: HANDLE_SIZE / 2,
            backgroundColor: 'white',
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.6)',
          }}
        />
      </GestureDetector>
      <GestureDetector gesture={bottomRightGesture}>
        <View
          accessibilityLabel={translate('Crop bottom-right handle', { ns: 'chat' })}
          hitSlop={handleHitSlop}
          style={{
            position: 'absolute',
            left: rect.x + rect.width - handleOffset,
            top: rect.y + rect.height - handleOffset,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: HANDLE_SIZE / 2,
            backgroundColor: 'white',
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.6)',
          }}
        />
      </GestureDetector>
    </View>
  )
}
