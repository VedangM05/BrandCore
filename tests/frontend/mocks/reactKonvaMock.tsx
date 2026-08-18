// jsdom has no real <canvas> 2D context, and konva/react-konva ship ESM that
// Jest can't parse from node_modules. Canvas pixel content isn't meaningfully
// assertable via RTL anyway, so tests mock the whole react-konva surface with
// plain DOM stand-ins and assert on the editor's real (non-canvas) controls
// instead - text inputs, sliders, buttons.
import React, { forwardRef } from 'react';

export const Stage = forwardRef<any, any>(({ children, width, height }, ref) => {
  React.useImperativeHandle(ref, () => ({
    toDataURL: () => 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh',
  }));
  return (
    <div data-testid="asset-editor-stage" data-width={width} data-height={height}>
      {children}
    </div>
  );
});

export const Layer: React.FC<any> = ({ children }) => <div data-testid="konva-layer">{children}</div>;
export const Image: React.FC<any> = () => <div data-testid="konva-image" />;
export const Text: React.FC<any> = ({ text }) => <div data-testid="konva-text">{text}</div>;
export const Rect: React.FC<any> = () => null;
export const Transformer = forwardRef<any, any>((_props, ref) => {
  React.useImperativeHandle(ref, () => ({ nodes: () => {}, getLayer: () => ({ batchDraw: () => {} }) }));
  return null;
});
