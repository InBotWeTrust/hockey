export const decorCategories = [
  'floorlamp',
  'plant',
  'pillows',
  'throw',
  'audio',
  'poster',
] as const;
export type DecorCategory = (typeof decorCategories)[number];
export type ApartmentDesignId = 'base' | 'scandinavian' | 'modern' | 'premium';
export interface ApartmentImageLayer {
  kind: 'image';
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  decor?: DecorCategory;
  trophyIndex?: number;
  supportY?: number;
}
export type ApartmentLayer =
  | ApartmentImageLayer
  | (Omit<ApartmentImageLayer, 'kind'> & {
      kind: 'image-shadow';
      dx: number;
      dy: number;
      blur: number;
      opacity: number;
    })
  | {
      kind: 'surface';
      id: string;
      src: string;
      points: string;
      shade: number;
      pattern: boolean;
    }
  | { kind: 'trim'; id: string; points: string }
  | {
      kind: 'shadow';
      blur?: number;
      decor?: DecorCategory;
      id: string;
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      opacity: number;
    };
export interface ApartmentDesign {
  id: ApartmentDesignId;
  title: string;
  description: string;
  layers: ApartmentLayer[];
}
