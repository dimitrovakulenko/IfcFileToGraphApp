import React, { useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape"; // Import Cytoscape core
import dagre from "cytoscape-dagre"; // Import dagre layout
import axios from "axios";

// Register the dagre layout plugin
cytoscape.use(dagre);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

const App: React.FC = () => {
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setUploadProgress(0); // Reset upload progress
    }
  };

  // Upload file in chunks and extract graph data from the last response
  const uploadAndFetchGraph = async () => {
    if (!file) {
      alert("Please select an IFC file before uploading!");
      return;
    }

    setLoading(true);
    setGraphData({ nodes: [], edges: [] }); // Clear the graph data
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = Date.now().toString(); // Unique file ID

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

        // Capture the last response (contains the graph data)
        lastResponse = response.data;

        // Update progress
        setUploadProgress(Math.round(((chunkNumber + 1) / totalChunks) * 100));
        console.log(`Uploaded chunk ${chunkNumber + 1}/${totalChunks}`);
      }

      // Set graph data from the last response
      if (lastResponse) {
        console.log(lastResponse)
        const { nodes, edges } = lastResponse;
  
        // Extract node IDs for validation
        const nodeIds = new Set(nodes.map((node:any) => node.data.id));
  
        // Filter out invalid edges
        const validEdges = edges.filter(
          (edge:any) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
        );

        // Set validated graph data
        setGraphData({ nodes, edges: validEdges });
  
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

  return (
    <div style={{ padding: "20px" }}>
      <h1>IFC Graph Viewer</h1>

      {/* File Input */}
      <div style={{ marginBottom: "20px" }}>
        <input type="file" accept=".ifc" onChange={handleFileChange} />
      </div>

      {/* Progress Indicator */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div style={{ marginBottom: "20px" }}>
          <p>Uploading... {uploadProgress}%</p>
        </div>
      )}

      {/* Upload Button */}
      <button onClick={uploadAndFetchGraph} disabled={loading || !file}>
        {loading ? "Processing..." : "Upload and Visualize Graph"}
      </button>

      {/* Loading Spinner */}
      {loading && <p>Loading... Please wait while the graph is processed.</p>}

      {/* Graph Visualization */}
      {!loading && graphData.nodes.length > 0 && (
        <div style={{ height: "600px", marginTop: "20px" }}>
          <CytoscapeComponent
            elements={[...graphData.nodes, ...graphData.edges]}
            style={{ width: "100%", height: "100%" }}
            layout={{
              name: "dagre", // A hierarchical layout
            }}
            cy={(cy) => {
              // Customize behavior or log Cytoscape instance
              cy.on("tap", "node", (event: any) => {
                console.log("Tapped node:", event.target.data());
              });
            }}
          />
        </div>
      )}
    </div>
  );
};

export default App;
