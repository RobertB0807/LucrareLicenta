import { StyleSheet, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

export function AppBackdrop({ grid = false }: { grid?: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <View style={styles.tealOrb} />
      <View style={styles.blueOrb} />
      <View style={styles.bottomOrb} />
      {grid ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View
              key={`horizontal-${index}`}
              style={[styles.horizontalLine, { top: `${index * 20}%` }]}
            />
          ))}
          {[0, 1, 2, 3, 4].map((index) => (
            <View
              key={`vertical-${index}`}
              style={[styles.verticalLine, { left: `${index * 25}%` }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TrainingColors.pageBase,
  },
  tealOrb: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    top: -190,
    right: -150,
    backgroundColor: 'rgba(77, 228, 178, 0.075)',
  },
  blueOrb: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    top: 180,
    left: -320,
    backgroundColor: 'rgba(50, 121, 230, 0.08)',
  },
  bottomOrb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -210,
    right: -120,
    backgroundColor: 'rgba(104, 169, 255, 0.06)',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  horizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(104, 169, 255, 0.09)',
  },
  verticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(104, 169, 255, 0.075)',
  },
});
