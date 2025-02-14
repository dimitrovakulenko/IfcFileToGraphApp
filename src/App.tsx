import React, { useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";
import axios from "axios";
import "./App.css";

cytoscape.use(cola);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

const App: React.FC = () => {
  // Full graph data from the backend
  const [fullGraphData, setFullGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // Graph data currently shown in the Cytoscape view
  const [displayGraphData, setDisplayGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // List of unique node types (based on node.data.type)
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  // Currently activated entity (node) types
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<string>>(new Set());
  // How many nodes to display (default 25)
  const [initialNodeCount, setInitialNodeCount] = useState<number>(100);
  // A key used to force re‑mount of Cytoscape when the view is reset
  const [graphKey, setGraphKey] = useState<number>(0);

  // Other states
  const [loading, setLoading] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Ref for the Cytoscape instance
  const cyRef = useRef<any>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setUploadProgress(0);
    }
  };

  // Upload file in chunks and store full graph data
  const uploadAndFetchGraph = async () => {
    if (!file) {
      alert("Please select an IFC file before uploading!");
      return;
    }

    setLoading(true);
    // Clear any previous data and selections
    setFullGraphData({ nodes: [], edges: [] });
    setDisplayGraphData({ nodes: [], edges: [] });
    setSelectedNode(null);
    setActiveNodeTypes(new Set<string>());
    setNodeTypes([]);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = Date.now().toString();
    let lastResponse = null;

    try {
      for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
        const start = chunkNumber * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);

        const response = await axios.post("http://127.0.0.1:5050/upload", chunk, {
          headers: {
            "Content-Type": "application/octet-stream",
            "file-id": fileId,
            "chunk-number": chunkNumber.toString(),
            "total-chunks": totalChunks.toString(),
          },
        });

        lastResponse = response.data;
        setUploadProgress(Math.round(((chunkNumber + 1) / totalChunks) * 100));
      }

      if (lastResponse) {
        const { nodes, edges } = lastResponse;
        // Validate edges so that only those connecting returned nodes remain
        const nodeIds = new Set(nodes.map((node: any) => String(node.data.id)));
        const validEdges = edges.filter(
          (edge: any) =>
            nodeIds.has(String(edge.data.source)) &&
            nodeIds.has(String(edge.data.target))
        );
        setFullGraphData({ nodes, edges: validEdges });

        // Extract unique node types (assuming node.data.type exists)
        const types = new Set<string>(nodes.map((node: any) => node.data.type));
        setNodeTypes(Array.from(types));
      }
    } catch (error) {
      console.error("Error uploading file or fetching graph data:", error);
    } finally {
      setLoading(false);
    }
  };

  // When a node type is clicked, show the first N nodes of that type.
  const handleNodeTypeClick = (type: string) => {
    setActiveNodeTypes((prev) => {
      const newSet = new Set(prev);
      var turnOn = true;
      if (newSet.has(type)) {
        newSet.delete(type);
        turnOn = false;
      } else {
        newSet.add(type);
      }
      updateGraphDisplayWith(type, turnOn);
      return newSet;
    });
  };

  const updateGraphDisplayWith = (type: String, turnOn: boolean) => {
    var updatedNodes: any[];
    if(turnOn){
      updatedNodes = displayGraphData.nodes
      const lenthBefore = updatedNodes.length

      fullGraphData.nodes.forEach(n => {
        if(n.data.type == type){
          const found = updatedNodes.find(n2 => n2.data.id == n.data.id)
          if(!found){
            if(updatedNodes.length < lenthBefore + initialNodeCount)
              updatedNodes.push(n)
          }            
        }
      })      
    }
    else {
      updatedNodes = displayGraphData.nodes.filter(n => n.data.type != type)      
    }

    const nodeIds = new Set(updatedNodes.map((node) => String(node.data.id)));
    const updatedEdges = fullGraphData.edges.filter(
      (edge) => nodeIds.has(String(edge.data.source)) && nodeIds.has(String(edge.data.target))
    );

    setDisplayGraphData({ nodes: updatedNodes, edges: updatedEdges });
    setGraphKey((prev) => prev + 1);
  }

  const updateGraphDisplay = (activeTypes: Set<string>) => {
    const filteredNodes = fullGraphData.nodes.filter((node) =>
      activeTypes.has(node.data.type)
    );
  
    const nodeIds = new Set(filteredNodes.map((node) => String(node.data.id)));
    const filteredEdges = fullGraphData.edges.filter(
      (edge) => nodeIds.has(String(edge.data.source)) && nodeIds.has(String(edge.data.target))
    );

    setDisplayGraphData({ nodes: filteredNodes, edges: filteredEdges });
    setGraphKey((prev) => prev + 1);
  };

  // Allow user to change how many nodes are initially displayed.
  const handleNodeCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(event.target.value, 10);
    setInitialNodeCount(count);
    updateGraphDisplay(activeNodeTypes)    
  };

  // Reset the view to the default node subset for the selected type.
  const resetView = () => {
    const defaultCount = 100;
    setInitialNodeCount(defaultCount);
    setSelectedNode(null);
    updateGraphDisplay(activeNodeTypes)
  };

  const debugNode = (nodeId: string) => {
    const existingNode = fullGraphData.nodes.find(n => n.data.id == nodeId)
    console.log(existingNode)

    const allEdges = fullGraphData.edges.filter(
      (edge) => edge.data.source === nodeId || edge.data.target === nodeId
    );
    console.log(allEdges)
  };

  const isolateNode = (nodeId: string) => {
    const existingNode = fullGraphData.nodes.find(n => n.data.id == nodeId)
    console.log(existingNode)

    // const allEdges = fullGraphData.edges.filter(
    //   (edge) => edge.data.source === nodeId || edge.data.target === nodeId
    // );
    
    setDisplayGraphData({ nodes: [existingNode], edges: [] });
  };  

  // Expand a node by fetching its neighbors from the backend.
  const expandNode = (nodeId: string) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
  
    // Get existing nodes and edges from state
    const existingNodeIds = new Set(displayGraphData.nodes.map((node) => String(node.data.id)));
    const existingEdgeIds = new Set(displayGraphData.edges.map((edge) => String(edge.data.id)));
  
    // Find new edges related to the node that are not already in the state
    const newEdgesData = fullGraphData.edges.filter(
      (edge) =>
        (edge.data.source === nodeId || edge.data.target === nodeId) &&
        !existingEdgeIds.has(String(edge.data.id))
    );
  
    // From these edges, find the new nodes that are not already present
    const newNodeIds = new Set(
      newEdgesData.flatMap((edge) => [String(edge.data.source), String(edge.data.target)])
    );
    const newNodesData = fullGraphData.nodes.filter(
      (node) => newNodeIds.has(String(node.data.id)) && !existingNodeIds.has(String(node.data.id))
    );
  
    // Update React state to keep track of currently displayed elements.
    setDisplayGraphData((prev) => ({
      nodes: [...prev.nodes, ...newNodesData],
      edges: [...prev.edges, ...newEdgesData],
    }));
  
    // Add new nodes and edges directly to the Cytoscape instance.
    cy.batch(() => {
      newNodesData.forEach((node) => {
        if (!cy.getElementById(node.data.id).length) {
          cy.add({ group: "nodes", ...node });
        }
      });
      newEdgesData.forEach((edge) => {
        if (!cy.getElementById(edge.data.id).length) {
          cy.add({ group: "edges", ...edge });
        }
      });
    });
  
    // Run layout to adjust positions of the new nodes while preserving existing ones.
    const layout = cy.layout({
      name: "cola",
      fit: false, // do not fit the viewport to the whole graph
      randomize: false, // preserve positions for nodes already placed
      animate: true,
      padding: 30,
      nodeRepulsion: 2048,
      idealEdgeLength: 400,
      edgeElasticity: 0.5,
      gravity: 0.5,
    });
    layout.run();
  };  

  return (
    <div className="container">
      <div className="sidebar-container">
        <div className="sidebar">
          <h1 className="tool-name">IFC Graph Viewer</h1>

          <div className="upload-section">
            <input type="file" accept=".ifc" onChange={handleFileChange} />
            <button onClick={uploadAndFetchGraph} disabled={loading || !file}>
              {loading ? "Processing..." : "Upload and Process Graph"}
            </button>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <p className="upload-progress">Uploading... {uploadProgress}%</p>
            )}
          </div>

          {fullGraphData.nodes.length > 0 && (
              <div className="entity-selection">
                <h2>Choose Entity Type</h2>
                <div className="entity-buttons">
                  {nodeTypes.map((type, index) => (
                    <button
                      key={index}
                      onClick={() => handleNodeTypeClick(type)}
                      className={activeNodeTypes.has(type) ? "active" : ""}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <div className="controls">
                <div className="node-count-control">
                  <label>
                    Number of nodes:
                    <input
                      type="number"
                      value={initialNodeCount}
                      onChange={handleNodeCountChange}
                      min="1"
                    />
                  </label>
                </div>
                <button onClick={resetView} className="reset-btn">
                  Reset View
                </button>
              </div>
              </div>
          )}

          {selectedNode && (
            <div className="properties-panel">
              <h2>Node Details</h2>
              {Object.entries(selectedNode).map(([key, value]) => (
                <p key={key}>
                  <strong>{key}:</strong> {JSON.stringify(value)}
                </p>
              ))}
              <button onClick={() => expandNode(selectedNode.id)}>Expand</button>
              <button onClick={() => debugNode(selectedNode.id)}>Debug</button>
              <button onClick={() => isolateNode(selectedNode.id)}>Isolate</button>
              <button onClick={() => setSelectedNode(null)}>Close</button>
            </div>
          )}
        </div>
      </div>

      <div className="main">
        <div className="graph-area">
          {displayGraphData.nodes.length > 0 && (
            <CytoscapeComponent
              key={graphKey}
              elements={[...displayGraphData.nodes, ...displayGraphData.edges]}
              layout={{
                name: "cola",
                padding: 30,
                nodeRepulsion: 2048,
                idealEdgeLength: 400,
                edgeElasticity: 0.5,
                gravity: 0.5,
                animate: true,
              }}
              style={{ height: "100vh" }}
              cy={(cy) => {
                cyRef.current = cy;
                cy.on("tap", "node", (event: any) => {
                  const nodeData = event.target.data();
                  setSelectedNode(nodeData);
                  setSelectedNodeId(nodeData.id);
                });
                cy.on("click", (_: any) => {
                  setSelectedNode(null)
                });

                if (selectedNodeId) {
                  const node = cy.$id(selectedNodeId);
                  if (node) {
                    node.select();
                  }
                }

                cy.style([
                  {
                    selector: "node",
                    style: {
                      "label": "data(label)",
                      "font-size": "6px",
                      "text-valign": "center",
                      "text-halign": "center",
                      //"color": "#333",
                      //"background-color": "pink",
                      "width": "20px",
                      "height": "20px",
                    },
                  },
                  {
                    selector: "edge",
                    style: {
                      "label": "data(label)",
                      "font-size": "6px",
                      "line-color": "#999",
                      "target-arrow-color": "#999",
                      "target-arrow-shape": "triangle",
                      "curve-style": "bezier",
                    },
                  },
                ]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
