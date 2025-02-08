import React, { useState, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import axios from "axios";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

const App: React.FC = () => {
  // State to hold the full graph data returned from the backend
  const [fullGraphData, setFullGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // State for the nodes/edges currently shown in the visualization
  const [displayGraphData, setDisplayGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  // The list of unique node types (extracted from node.data.type)
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  // The currently selected node type (if any)
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  // The number of nodes to show initially when a type is selected
  const [initialNodeCount, setInitialNodeCount] = useState<number>(25);
  // A key to force re-mount of Cytoscape when switching types (resetting the view)
  const [graphKey, setGraphKey] = useState<number>(0);

  // Other states…
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedNode, setSelectedNode] = useState<any>(null); // For showing details and expand button

  // Optional: a ref for direct access to the Cytoscape instance
  const cyRef = useRef<any>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setUploadProgress(0);
    }
  };

  // Upload file in chunks and store the full graph data
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

        // Capture the last response (assumed to contain the full graph data)
        lastResponse = response.data;

        // Update progress
        setUploadProgress(Math.round(((chunkNumber + 1) / totalChunks) * 100));
        console.log(`Uploaded chunk ${chunkNumber + 1}/${totalChunks}`);
      }

      if (lastResponse) {
        const { nodes, edges } = lastResponse;

        // Validate the edges (only keep those connecting nodes from the response)
        const nodeIds = new Set(nodes.map((node: any) => String(node.data.id)));
        const validEdges = edges.filter(
          (edge: any) =>
            nodeIds.has(String(edge.data.source)) &&
            nodeIds.has(String(edge.data.target))
        );

        // Store the full graph data
        setFullGraphData({ nodes, edges: validEdges });

        // Extract and store the unique node types (assumes each node has a data.type property)
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

  // When a node type tag is clicked, reset the view and display the first N nodes of that type.
  const handleNodeTypeClick = (type: string) => {
    // Always reset the node count to default for a fresh selection
    const defaultCount = 25;
    setInitialNodeCount(defaultCount);
    setSelectedNodeType(type);
    setSelectedNode(null); // Clear any previously selected node

    // Filter the full data based on the selected type
    const filteredNodes = fullGraphData.nodes.filter(
      (node) => node.data.type === type
    );
    console.log(`Filtering for type "${type}". Total found: ${filteredNodes.length}`);

    // Grab the first N nodes
    const initialNodes = filteredNodes.slice(0, defaultCount);
    const initialNodeIds = new Set(initialNodes.map((node: any) => String(node.data.id)));

    // Get only the edges that connect nodes within this subset
    const initialEdges = fullGraphData.edges.filter(
      (edge: any) =>
        initialNodeIds.has(String(edge.data.source)) &&
        initialNodeIds.has(String(edge.data.target))
    );
    
    // Set the display graph data and force a remount of Cytoscape
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

  // Function to expand a node by fetching its neighbors from the backend.
  // The new nodes/edges are merged into the currently displayed graph.
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
    <div style={{ padding: "20px", display: "flex" }}>
      <div style={{ flex: 1 }}>
        <h1>IFC Graph Viewer</h1>

        {/* File Input */}
        <div style={{ marginBottom: "20px" }}>
          <input type="file" accept=".ifc" onChange={handleFileChange} />
        </div>

        {/* Upload Progress */}
        {uploadProgress > 0 && uploadProgress < 100 && (
          <div style={{ marginBottom: "20px" }}>
            <p>Uploading... {uploadProgress}%</p>
          </div>
        )}

        {/* Upload Button */}
        <button onClick={uploadAndFetchGraph} disabled={loading || !file}>
          {loading ? "Processing..." : "Upload and Process Graph"}
        </button>

        {loading && <p>Loading... Please wait while the graph is processed.</p>}

        {/* Node Type Selection */}
        {!loading && fullGraphData.nodes.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h2>Select Node Type</h2>
            {nodeTypes.map((type, index) => (
              <button
                key={index}
                onClick={() => handleNodeTypeClick(type)}
                style={{
                  marginRight: "10px",
                  marginBottom: "10px",
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
        )}

        {/* Initial Node Count Control */}
        {selectedNodeType && (
          <div style={{ marginTop: "10px" }}>
            <label>
              Number of nodes to display:
              <input
                type="number"
                value={initialNodeCount}
                onChange={handleNodeCountChange}
                min="1"
                style={{ marginLeft: "10px", width: "60px" }}
              />
            </label>
          </div>
        )}

        {/* Graph Visualization */}
        {!loading && displayGraphData.nodes.length > 0 && (
          <div style={{ height: "600px", marginTop: "20px" }}>
            <CytoscapeComponent
              key={graphKey} // Using a unique key forces remounting the component
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
                // When a node is clicked, show its details in the sidebar.
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
        <div
          style={{
            width: "300px",
            background: "#f9f9f9",
            padding: "10px",
            marginLeft: "20px",
            borderRadius: "5px",
            boxShadow: "0px 0px 5px rgba(0,0,0,0.3)",
          }}
        >
          <h3>Node Details</h3>
          {Object.entries(selectedNode).map(([key, value]) => (
            <p key={key}>
              <b>{key}</b>: {JSON.stringify(value)}
            </p>
          ))}
          <button onClick={() => expandNode(selectedNode.id)}>
            Expand Neighbors
          </button>
          <button onClick={() => setSelectedNode(null)}>Close</button>
        </div>
      )}
    </div>
  );
};

export default App;
