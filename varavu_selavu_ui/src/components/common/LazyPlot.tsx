import React, { Suspense, lazy } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

// plotly.js is a multi-MB dependency (every trace type: scatter, bar, sankey, 3D, geo, ...)
// that was previously bundled into the app's main JS chunk, so every user downloaded it on
// first load even before visiting a page with a chart. A dynamic import() moves it into its
// own chunk that webpack only fetches the first time a chart actually renders.
const Plot = lazy(() => import('react-plotly.js'));

// react-plotly.js ships without its own type declarations (see src/react-plotly.js.d.ts);
// `any` here matches the untyped surface every existing chart component was already calling
// into, not a new type-safety regression.
const LazyPlot: React.FC<any> = (props) => {
  const fallbackHeight = props?.style?.height ?? 350;
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: fallbackHeight, width: '100%' }}>
          <CircularProgress size={28} />
        </Box>
      }
    >
      <Plot {...props} />
    </Suspense>
  );
};

export default LazyPlot;
