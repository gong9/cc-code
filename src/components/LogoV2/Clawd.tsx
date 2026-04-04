import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { env } from '../../utils/env.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

// Kawaii cat ASCII art - 3 rows, ~9 cols wide
// Each pose has 3 lines: ears, face, paws
type CatPose = {
  row1: string;  // ears
  row2: string;  // face with expression
  row3: string;  // paws/body
};

const CAT_POSES: Record<ClawdPose, CatPose> = {
  default: {
    row1: ' /\\_/\\ ',
    row2: '( ^ω^ )',
    row3: ' />  <\\'
  },
  'look-left': {
    row1: ' /\\_/\\ ',
    row2: '( <ω^ )',
    row3: ' />  <\\'
  },
  'look-right': {
    row1: ' /\\_/\\ ',
    row2: '( ^ω> )',
    row3: ' />  <\\'
  },
  'arms-up': {
    row1: '\\(/\\_/\\)/',
    row2: ' ( ^ω^ )',
    row3: '  (   ) '
  }
};

// Apple Terminal compatible version (simpler)
const APPLE_CAT_POSES: Record<ClawdPose, CatPose> = {
  default: {
    row1: ' /\\_/\\ ',
    row2: '( ^ω^ )',
    row3: '  ω ω  '
  },
  'look-left': {
    row1: ' /\\_/\\ ',
    row2: '( <ω^ )',
    row3: '  ω ω  '
  },
  'look-right': {
    row1: ' /\\_/\\ ',
    row2: '( ^ω> )',
    row3: '  ω ω  '
  },
  'arms-up': {
    row1: ' /\\_/\\ ',
    row2: '( ^ω^ )',
    row3: '  ω ω  '
  }
};

export function Clawd(t0: Props | undefined) {
  const $ = _c(8);
  let t1;
  if ($[0] !== t0) {
    t1 = t0 === undefined ? {} : t0;
    $[0] = t0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const { pose: t2 } = t1;
  const pose = t2 === undefined ? "default" : t2;
  
  if (env.terminal === "Apple_Terminal") {
    let t3;
    if ($[2] !== pose) {
      t3 = <AppleTerminalCat pose={pose} />;
      $[2] = pose;
      $[3] = t3;
    } else {
      t3 = $[3];
    }
    return t3;
  }
  
  const cat = CAT_POSES[pose];
  let t3;
  if ($[4] !== cat) {
    t3 = (
      <Box flexDirection="column">
        <Text color="clawd_body">{cat.row1}</Text>
        <Text color="clawd_body">{cat.row2}</Text>
        <Text color="clawd_body">{cat.row3}</Text>
      </Box>
    );
    $[4] = cat;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}

function AppleTerminalCat({ pose }: { pose: ClawdPose }) {
  const $ = _c(4);
  const cat = APPLE_CAT_POSES[pose];
  let t1;
  if ($[0] !== cat) {
    t1 = (
      <Box flexDirection="column" alignItems="center">
        <Text color="clawd_body">{cat.row1}</Text>
        <Text color="clawd_body">{cat.row2}</Text>
        <Text color="clawd_body">{cat.row3}</Text>
      </Box>
    );
    $[0] = cat;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
