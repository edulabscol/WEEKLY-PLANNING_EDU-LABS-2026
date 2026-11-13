// Declaraciones mínimas de React 19 para el chequeo de tipos.
// Se usan porque @types/react no estaba disponible sin conexión a internet en el entorno de construcción.
// Cubren exclusivamente la API que usa esta aplicación. Ver docs/TECHNICAL_DECISIONS.md (DT-07).

declare module 'react' {
  export type Key = string | number;
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | null;
  }
  export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;

  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface RefObject<T> {
    current: T;
  }
  export type Ref<T> = RefObject<T | null> | ((instance: T | null) => void) | null;

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(initial: T): RefObject<T>;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useId(): string;

  export type FC<P = object> = (props: P) => ReactNode;
  export interface Context<T> {
    Provider: FC<{ value: T; children?: ReactNode }>;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(ctx: Context<T>): T;

  export const Fragment: FC<{ children?: ReactNode }>;
  export const StrictMode: FC<{ children?: ReactNode }>;

  export type CSSProperties = Record<string, string | number | undefined>;

  export interface SyntheticEvent<T = Element, E = Event> {
    currentTarget: T;
    target: EventTarget;
    nativeEvent: E;
    defaultPrevented: boolean;
    preventDefault(): void;
    stopPropagation(): void;
  }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T;
  }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface FocusEvent<T = Element> extends SyntheticEvent<T, globalThis.FocusEvent> {
    relatedTarget: EventTarget | null;
  }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, globalThis.MouseEvent> {
    button: number;
    clientX: number;
    clientY: number;
  }
  export interface DragEvent<T = Element> extends MouseEvent<T> {
    dataTransfer: DataTransfer;
  }

  export interface DOMAttributes<T> {
    children?: ReactNode;
    onClick?: (e: MouseEvent<T>) => void;
    onMouseDown?: (e: MouseEvent<T>) => void;
    onChange?: (e: ChangeEvent<T>) => void;
    onInput?: (e: FormEvent<T>) => void;
    onSubmit?: (e: FormEvent<T>) => void;
    onKeyDown?: (e: KeyboardEvent<T>) => void;
    onBlur?: (e: FocusEvent<T>) => void;
    onFocus?: (e: FocusEvent<T>) => void;
    onDragStart?: (e: DragEvent<T>) => void;
    onDragEnd?: (e: DragEvent<T>) => void;
    onDragOver?: (e: DragEvent<T>) => void;
    onDragLeave?: (e: DragEvent<T>) => void;
    onDrop?: (e: DragEvent<T>) => void;
    onError?: (e: SyntheticEvent<T>) => void;
  }

  export interface AllHTMLAttributes<T> extends DOMAttributes<T> {
    className?: string;
    id?: string;
    style?: CSSProperties;
    title?: string;
    role?: string;
    tabIndex?: number;
    hidden?: boolean;
    draggable?: boolean;
    lang?: string;
    // formularios
    name?: string;
    value?: string | number | readonly string[];
    defaultValue?: string | number;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    required?: boolean;
    checked?: boolean;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    maxLength?: number;
    minLength?: number;
    rows?: number;
    autoComplete?: string;
    autoFocus?: boolean;
    inputMode?: string;
    htmlFor?: string;
    form?: string;
    noValidate?: boolean;
    // otros
    alt?: string;
    src?: string;
    href?: string;
    target?: string;
    rel?: string;
    width?: number | string;
    height?: number | string;
    colSpan?: number;
  }
}

declare module 'react/jsx-runtime' {
  import type { AllHTMLAttributes, Key, ReactElement, ReactNode, Ref } from 'react';
  type Elements = {
    [K in keyof HTMLElementTagNameMap]: AllHTMLAttributes<HTMLElementTagNameMap[K]> & { ref?: Ref<HTMLElementTagNameMap[K]>; key?: Key };
  };
  export namespace JSX {
    type Element = ReactElement;
    type ElementType = string | ((props: never) => ReactNode);
    interface ElementChildrenAttribute {
      children: object;
    }
    interface IntrinsicAttributes {
      key?: Key | null;
    }
    interface IntrinsicElements extends Elements {}
  }
  export const jsx: unknown;
  export const jsxs: unknown;
  export const Fragment: unknown;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export interface Root {
    render(node: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element): Root;
}
