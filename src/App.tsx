import React, { useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import axios from "axios";
import "./App.css";

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
  // Currently selected entity (node) type
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  // How many nodes to display (default 25)
  const [initialNodeCount, setInitialNodeCount] = useState<number>(25);
  // A key used to force re‑mount of Cytoscape when the view is reset
  const [graphKey, setGraphKey] = useState<number>(0);

  // Other states
  const [loading, setLoading] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedNode, setSelectedNode] = useState<any>(null);

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
    setSelectedNodeType(null);
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
        const types = new Set(nodes.map((node: any) => node.data.type));
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
    const defaultCount = 25;
    setInitialNodeCount(defaultCount);
    setSelectedNodeType(type);
    setSelectedNode(null);

    const filteredNodes = fullGraphData.nodes.filter(
      (node) => node.data.type === type
    );
    const initialNodes = filteredNodes.slice(0, defaultCount);
    const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));
    const initialEdges = fullGraphData.edges.filter(
      (edge: any) =>
        initialNodeIds.has(String(edge.data.source)) &&
        initialNodeIds.has(String(edge.data.target))
    );
    setDisplayGraphData({ nodes: initialNodes, edges: initialEdges });
    setGraphKey((prev) => prev + 1);
  };

  // Allow user to change how many nodes are initially displayed.
  const handleNodeCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(event.target.value, 10);
    setInitialNodeCount(count);
    if (selectedNodeType) {
      const filteredNodes = fullGraphData.nodes.filter(
        (node) => node.data.type === selectedNodeType
      );
      const initialNodes = filteredNodes.slice(0, count);
      const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));
      const initialEdges = fullGraphData.edges.filter(
        (edge: any) =>
          initialNodeIds.has(String(edge.data.source)) &&
          initialNodeIds.has(String(edge.data.target))
      );
      setDisplayGraphData({ nodes: initialNodes, edges: initialEdges });
      setGraphKey((prev) => prev + 1);
    }
  };

  // Reset the view to the default node subset for the selected type.
  const resetView = () => {
    if (selectedNodeType) {
      const defaultCount = 25;
      setInitialNodeCount(defaultCount);
      setSelectedNode(null);
      const filteredNodes = fullGraphData.nodes.filter(
        (node) => node.data.type === selectedNodeType
      );
      const initialNodes = filteredNodes.slice(0, defaultCount);
      const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));
      const initialEdges = fullGraphData.edges.filter(
        (edge: any) =>
          initialNodeIds.has(String(edge.data.source)) &&
          initialNodeIds.has(String(edge.data.target))
      );
      setDisplayGraphData({ nodes: initialNodes, edges: initialEdges });
      setGraphKey((prev) => prev + 1);
    }
  };

  // Expand a node by fetching its neighbors from the backend.
  const expandNode = async (nodeId: string) => {
    try {
      const response = await axios.post("http://127.0.0.1:5050/fetch_neighbors", {
        node_id: nodeId,
      });
      const newNodes = response.data.nodes;
      const newEdges = response.data.edges;

      setDisplayGraphData((prev) => {
        const existingNodeIds = new Set(prev.nodes.map((node) => String(node.data.id)));
        const mergedNodes = [...prev.nodes];
        newNodes.forEach((node: any) => {
          if (!existingNodeIds.has(String(node.data.id))) {
            mergedNodes.push(node);
          }
        });
        const existingEdgeIds = new Set(prev.edges.map((edge) => String(edge.data.id)));
        const mergedEdges = [...prev.edges];
        newEdges.forEach((edge: any) => {
          if (!existingEdgeIds.has(String(edge.data.id))) {
            mergedEdges.push(edge);
          }
        });
        return { nodes: mergedNodes, edges: mergedEdges };
      });
    } catch (error) {
      console.error("Error fetching neighbors:", error);
    }
  };

  return (
    <div className="container">
      {/* Left Column (20%) */}
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

        {selectedNodeType && (
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
        )}

        {fullGraphData.nodes.length > 0 && (
          <div className="entity-selection">
            <h2>Choose Entity Type</h2>
            <div className="entity-buttons">
              {nodeTypes.map((type, index) => (
                <button
                  key={index}
                  onClick={() => handleNodeTypeClick(type)}
                  className={selectedNodeType === type ? "active" : ""}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Right Column (80%) */}
      <div className="main">
        <div className="graph-area">
          {displayGraphData.nodes.length > 0 && (
            <CytoscapeComponent
              key={graphKey}
              elements={[...displayGraphData.nodes, ...displayGraphData.edges]}
              layout={{
                name: "cose",
                fit: true,
                padding: 30,
                nodeRepulsion: 2000,
                idealEdgeLength: 100,
                edgeElasticity: 0.5,
                gravity: 0.2,
                animate: true,
              }}
              style={{ width: "100%", height: "600px" }}
              cy={(cy) => {
                cyRef.current = cy;
                cy.on("tap", "node", (event: any) => {
                  const nodeData = event.target.data();
                  setSelectedNode(nodeData);
                });
              }}
            />
          )}
        </div>

        {selectedNode && (
          <div className="properties-panel">
            <h3>Node Details</h3>
            {Object.entries(selectedNode).map(([key, value]) => (
              <p key={key}>
                <strong>{key}:</strong> {JSON.stringify(value)}
              </p>
            ))}
            <button onClick={() => expandNode(selectedNode.id)}>Expand Neighbors</button>
            <button onClick={() => setSelectedNode(null)}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
