import type * as R from "react";

declare global {
  namespace JSX {
    type ElementType = R.JSX.ElementType;
    interface Element extends R.JSX.Element {}
    interface ElementClass extends R.JSX.ElementClass {}
    interface ElementAttributesProperty extends R.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends R.JSX.ElementChildrenAttribute {}
    type LibraryManagedAttributes<C, P> = R.JSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends R.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends R.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends R.JSX.IntrinsicElements {}
  }
}
