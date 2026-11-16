import type { ReactNode } from "react";
import { useState } from "react";

export function CounterBasic(): ReactNode {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
