/* Custom plotly.js bundle — only the trace types this app actually renders.
 *
 * The full `plotly.js` dist registers every trace, which drags in `maplibre-gl` for its
 * map traces (scattermapbox / choropleth / densitymapbox). This app renders exactly three
 * trace types — bar, scatter and sankey — and no map or geo chart anywhere, so all of that
 * was dead code that still shipped to users.
 *
 * That mattered beyond bundle size: maplibre-gl carries a critical XSS sanitizer-bypass
 * advisory (GHSA-jrc7-96c5-q579), and plotly pins a vulnerable range transitively, so
 * upgrading plotly alone does not clear it. Composing the bundle from `lib/core` plus the
 * three traces we use means the vulnerable module is never imported, never bundled, and
 * never reaches a browser.
 *
 * Adding a new chart type? Register its module here too, or the trace silently renders
 * as an empty plot.
 */
import Plotly from 'plotly.js/lib/core';
import bar from 'plotly.js/lib/bar';
import scatter from 'plotly.js/lib/scatter';
import sankey from 'plotly.js/lib/sankey';
import createPlotlyComponent from 'react-plotly.js/factory';

Plotly.register([bar, scatter, sankey]);

export default createPlotlyComponent(Plotly);
