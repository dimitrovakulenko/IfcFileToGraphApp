import React, { useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import axios from "axios";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

const App: React.FC = () => {
  // Full graph data from the backend
  const [fullGraphData, setFullGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // Data currently shown in the Cytoscape view
  const [displayGraphData, setDisplayGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // Unique node types (extracted from node.data.type)
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  // Currently selected node type
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  // How many nodes to show initially (default 25)
  const [initialNodeCount, setInitialNodeCount] = useState<number>(25);
  // A key used to force remount of the Cytoscape component
  const [graphKey, setGraphKey] = useState<number>(0);

  // Other states
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedNode, setSelectedNode] = useState<any>(null); // For sidebar node details

  // Optional: a ref to access the Cytoscape instance if needed
  const cyRef = useRef<any>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setUploadProgress(0);
    }
  };

  // Upload file in chunks and fetch full graph data
  const uploadAndFetchGraph = async () => {
    if (!file) {
      alert("Please select an IFC file before uploading!");
      return;
    }

    setLoading(true);
    // Clear previous data and selections
    setFullGraphData({ nodes: [], edges: [] });
    setDisplayGraphData({ nodes: [], edges: [] });
    setSelectedNode(null);
    setSelectedNodeType(null);
    setNodeTypes([]);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = Date.now().toString();

    try {
      let lastResponse = null;

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

        // Last response assumed to have the full graph data
        lastResponse = response.data;
        setUploadProgress(Math.round(((chunkNumber + 1) / totalChunks) * 100));
        console.log(`Uploaded chunk ${chunkNumber + 1}/${totalChunks}`);
      }

      if (lastResponse) {
        const { nodes, edges } = lastResponse;
        // Keep only valid edges connecting nodes in the response
        const nodeIds = new Set(nodes.map((node: any) => String(node.data.id)));
        const validEdges = edges.filter(
          (edge: any) =>
            nodeIds.has(String(edge.data.source)) &&
            nodeIds.has(String(edge.data.target))
        );
        setFullGraphData({ nodes, edges: validEdges });

        // Extract unique node types (assuming each node has a data.type property)
        const types = new Set(nodes.map((node: any) => node.data.type));
        setNodeTypes(Array.from(types));

        console.log("Graph loaded successfully!");
      } else {
        console.log("No graph data received. Check the backend.");
      }
    } catch (error) {
      console.error("Error uploading file or fetching graph data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Reset the Cytoscape view to its initial state for the current type.
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
      setGraphKey(prev => prev + 1);
    }
  };

  // When a node type is clicked, filter and show the first N nodes of that type.
  const handleNodeTypeClick = (type: string) => {
    const defaultCount = 25;
    setInitialNodeCount(defaultCount);
    setSelectedNodeType(type);
    setSelectedNode(null);

    const filteredNodes = fullGraphData.nodes.filter(
      (node) => node.data.type === type
    );
    console.log(`Filtering for type "${type}". Total found: ${filteredNodes.length}`);

    const initialNodes = filteredNodes.slice(0, defaultCount);
    const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));
    const initialEdges = fullGraphData.edges.filter(
      (edge: any) =>
        initialNodeIds.has(String(edge.data.source)) &&
        initialNodeIds.has(String(edge.data.target))
    );
    setDisplayGraphData({ nodes: initialNodes, edges: initialEdges });
    setGraphKey(prev => prev + 1);
  };

  // Allow the user to change how many nodes are initially displayed.
  const handleNodeCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(event.target.value, 10);
    setInitialNodeCount(count);
    if (selectedNodeType) {
      const filteredNodes = fullGraphData.nodes.filter(
        (node) => node.data.type === selectedNodeType
      );
      console.log(`Changing node count for "${selectedNodeType}". Total available: ${filteredNodes.length}`);
      const initialNodes = filteredNodes.slice(0, count);
      const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));
      const initialEdges = fullGraphData.edges.filter(
        (edge: any) =>
          initialNodeIds.has(String(edge.data.source)) &&
          initialNodeIds.has(String(edge.data.target))
      );
      setDisplayGraphData({ nodes: initialNodes, edges: initialEdges });
      setGraphKey(prev => prev + 1);
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
    <div style={{ padding: "20px", background: "#f0f2f5", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          gap: "20px",
        }}
      >
        {/* Left Panel */}
        <div style={{ flex: 1, background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
          <h1 style={{ marginBottom: "10px" }}>IFC Graph Viewer</h1>

          {/* File Upload */}
          <div style={{ marginBottom: "20px" }}>
            <input type="file" accept=".ifc" onChange={handleFileChange} />
          </div>

          {/* Upload Progress & Button */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div style={{ marginBottom: "20px" }}>
              <p>Uploading... {uploadProgress}%</p>
            </div>
          )}
          <button onClick={uploadAndFetchGraph} disabled={loading || !file} style={{ marginBottom: "20px", padding: "8px 16px" }}>
            {loading ? "Processing..." : "Upload and Process Graph"}
          </button>

          {loading && <p>Loading... Please wait while the graph is processed.</p>}

          {/* Node Type Selection */}
          {!loading && fullGraphData.nodes.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <h2>Select Node Type</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {nodeTypes.map((type, index) => (
                  <button
                    key={index}
                    onClick={() => handleNodeTypeClick(type)}
                    style={{
                      backgroundColor: selectedNodeType === type ? "#4CAF50" : "#e7e7e7",
                      color: selectedNodeType === type ? "white" : "black",
                      border: "none",
                      padding: "5px 10px",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Initial Node Count Control & Reset Button */}
          {selectedNodeType && (
            <div style={{ marginBottom: "20px" }}>
              <label>
                Number of nodes to display:{" "}
                <input
                  type="number"
                  value={initialNodeCount}
                  onChange={handleNodeCountChange}
                  min="1"
                  style={{ marginLeft: "10px", width: "60px" }}
                />
              </label>
              <button
                onClick={resetView}
                style={{
                  marginLeft: "20px",
                  padding: "6px 12px",
                  backgroundColor: "#ff5722",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Reset View
              </button>
            </div>
          )}

          {/* Graph Visualization */}
          {!loading && displayGraphData.nodes.length > 0 && (
            <div style={{ height: "600px", border: "1px solid #ddd", borderRadius: "4px" }}>
              <CytoscapeComponent
                key={graphKey}
                elements={[...displayGraphData.nodes, ...displayGraphData.edges]}
                style={{ width: "100%", height: "100%" }}
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
                cy={(cy) => {
                  cyRef.current = cy;
                  cy.on("tap", "node", (event: any) => {
                    const nodeData = event.target.data();
                    setSelectedNode(nodeData);
                  });
                }}
              />
            </div>
          )}
        </div>

        {/* Sidebar for Node Details */}
        {selectedNode && (
          <div style={{ width: "300px", background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginBottom: "10px" }}>Node Details</h3>
            {Object.entries(selectedNode).map(([key, value]) => (
              <p key={key}>
                <strong>{key}:</strong> {JSON.stringify(value)}
              </p>
            ))}
            <button onClick={() => expandNode(selectedNode.id)} style={{ marginRight: "10px", padding: "6px 12px" }}>
              Expand Neighbors
            </button>
            <button onClick={() => setSelectedNode(null)} style={{ padding: "6px 12px" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
