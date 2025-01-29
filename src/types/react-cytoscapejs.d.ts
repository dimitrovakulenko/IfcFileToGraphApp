declare module "react-cytoscapejs" {
    import { Component } from "react";
    import { CytoscapeOptions, ElementsDefinition, LayoutOptions } from "cytoscape";
  
    export interface CytoscapeComponentProps extends CytoscapeOptions {
      elements?: ElementsDefinition; // Nodes and edges
      layout?: LayoutOptions; // Add layout support
      cy?: (cy: cytoscape.Core) => void; // Callback to access the Cytoscape instance
      style?: React.CSSProperties; // Inline styles for the container
    }
  
    export default class CytoscapeComponent extends Component<CytoscapeComponentProps> {}
  }
  