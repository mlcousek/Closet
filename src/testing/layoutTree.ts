import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

export type LayoutNode = {
  type: string;
  props: Record<string, unknown>;
  children: (LayoutNode | string)[];
};

/**
 * What one part of the screen draws, for a snapshot: the native views with
 * their layout props, without the components that wrap them, handlers, or the
 * rest of the screen around it. Keeps a snapshot about the picture that is
 * made, not about the controls next to it.
 */
export function layoutTree(node: ReactTestInstance): LayoutNode {
  const [tree] = hostNodes(node);
  return tree as LayoutNode;
}

function hostNodes(node: ReactTestInstance | string): (LayoutNode | string)[] {
  if (typeof node === 'string') return [node];
  const children = node.children.flatMap(hostNodes);
  // A component only passes its props on to the views it draws.
  if (typeof node.type !== 'string') return children;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'children' || typeof value === 'function') continue;
    props[key] = key === 'style' ? StyleSheet.flatten(value) : value;
  }
  return [{ type: node.type, props, children }];
}
