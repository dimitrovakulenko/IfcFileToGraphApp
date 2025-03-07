import React, { useState, useRef, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";
import popper from "cytoscape-popper";
import { createPopper } from "@popperjs/core";
import "./App.css";

cytoscape.use(cola);
var createdPopper = popper(createPopper);
cytoscape.use(createdPopper);

const App: React.FC = () => {
  const [fullGraphData, setFullGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<string>>(new Set());
  const [initialNodeCount, setInitialNodeCount] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const cyRef = useRef<any>(null);
 
  const fullGraphDataRef = useRef(fullGraphData);  

  const activePopperRef = useRef<any>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  const activeFadeTimerRef = useRef<any>(null);

  const setGraphDataFrom = (graphString: any) => {
    const { nodes, edges } = graphString;
    const nodeIds = new Set(nodes.map((node: any) => String(node.data.id)));
    const validEdges = edges.filter(
      (edge: any) =>
        nodeIds.has(String(edge.data.source)) &&
        nodeIds.has(String(edge.data.target))
    );
    setFullGraphData({ nodes, edges: validEdges });
    const types = new Set<string>(nodes.map((node: any) => node.data.type));
    setNodeTypes(Array.from(types));
  };

  useEffect(() => {
    fullGraphDataRef.current = fullGraphData;
  }, [fullGraphData]);

  useEffect(() => {
    const loadDefaultGraph = async () => {
      try {
        const response = await fetch("/example_graph.json");
        const data = await response.json();
        console.log(data);
        setGraphDataFrom(data);
      } catch (error) {
        console.error("Error loading default graph:", error);
      }
    };
    loadDefaultGraph();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  const uploadAndFetchGraph = async () => {
    if (!file) {
      alert("Please select an IFC file before uploading!");
      return;
    }
    setLoading(true);
    setFullGraphData({ nodes: [], edges: [] });
    setSelectedNodeId(null);
    setActiveNodeTypes(new Set<string>());
    setNodeTypes([]);
  
    try {
      const formData = new FormData();
      formData.append("file", file);
     
      const response = await fetch(
        `/api/upload`, // ?max_nodes=1000000&max_relationships=1000000
        {
          method: "POST",
          body: formData
        }
      );
      if (response.ok) {
        const jsonData = await response.json();
        setGraphDataFrom(jsonData);
      } else {
        console.error("Error uploading file. Status:", response.status);
      }
    } catch (error) {
      console.error("Error uploading file or fetching graph data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeTypeClick = (type: string) => {
    setActiveNodeTypes((prev) => {
      const newSet = new Set(prev);
      let turnOn = true;
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

  const updateGraphDisplayWith = (type: string, turnOn: boolean) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    let updatedNodes = cy.nodes().toArray();
    if (turnOn) {
      const nodesToAdd: any[] = [];
      fullGraphData.nodes.forEach((n) => {
        if (n.data.type === type) {
          const exists = cy.getElementById(n.data.id).nonempty();
          if (!exists) {
            if (nodesToAdd.length < initialNodeCount) {
              nodesToAdd.push(n);
            }
          }
        }
      });
      updatedNodes = [...updatedNodes, ...nodesToAdd];
      cy.batch(() => {
        nodesToAdd.forEach((n) => {
          cy.add({ group: "nodes", ...n });
        });
      });
    } else {
      cy.batch(() => {
        cy.nodes().filter((n: any) => n.data("type") === type).remove();
      });
      updatedNodes = cy.nodes().toArray();
    }
    const nodeIds = new Set(updatedNodes.map((node: any) => String(node.data.id)));
    const updatedEdges = fullGraphData.edges.filter(
      (edge) =>
        nodeIds.has(String(edge.data.source)) &&
        nodeIds.has(String(edge.data.target))
    );
    cy.batch(() => {
      cy.edges().forEach((edge: any) => {
        const targetExists = cy.getElementById(edge.data("target")).nonempty();
        const sourceExists = cy.getElementById(edge.data("source")).nonempty();
        if (!targetExists || !sourceExists) {
          edge.remove();
        }
      });
      const existingEdgeIds = new Set(cy.edges().map((e: any) => e.id()));
      const edgesToAdd = updatedEdges.filter(
        (edge) => !existingEdgeIds.has(edge.data.id)
      );
      cy.add(edgesToAdd);
    });
    updateCyLayout(cy);
  };

  const updateGraphDisplay = (activeTypes: Set<string>) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const filteredNodes = fullGraphData.nodes.filter((node) =>
      activeTypes.has(node.data.type)
    );
    const nodeIds = new Set(filteredNodes.map((node) => String(node.data.id)));
    const filteredEdges = fullGraphData.edges.filter(
      (edge) =>
        nodeIds.has(String(edge.data.source)) &&
        nodeIds.has(String(edge.data.target))
    );
    cy.batch(() => {
      cy.elements().remove();
      cy.add(filteredNodes.map((node) => ({ group: "nodes", ...node })));
      cy.add(filteredEdges.map((edge) => ({ group: "edges", ...edge })));
    });
    updateCyLayout(cy);
  };

  const handleNodeCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(event.target.value, 10);
    setInitialNodeCount(count);
    updateGraphDisplay(activeNodeTypes);
  };

  const resetView = () => {
    const defaultCount = 100;
    setInitialNodeCount(defaultCount);
    setSelectedNodeId(null);
    updateGraphDisplay(activeNodeTypes);
  };

  const debugNode = (nodeId: string) => {
    const existingNode = fullGraphData.nodes.find((n) => n.data.id == nodeId);
    console.log(existingNode);
    const allEdges = fullGraphData.edges.filter(
      (edge) => edge.data.source === nodeId || edge.data.target === nodeId
    );
    console.log(allEdges);
  };

  const isolateNode = (nodeId: string) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.batch(() => {
      cy.nodes().forEach((node: any) => {
        if (node.id() !== nodeId) {
          node.remove();
        }
      });
      cy.edges().forEach((edge: any) => {
        edge.remove();
      });
    });
    updateCyLayout(cy);
  };

  const expandNode = (nodeId: string, graph: { nodes: any[]; edges: any[] }|undefined = undefined ) => {
    if (!cyRef.current) return;
    if(graph === undefined)
      graph = fullGraphData;

    const cy = cyRef.current;
    cy.batch(() => {
      graph.edges.forEach((edge) => {
        if (edge.data.source === nodeId) {
          const targetExists = cy.getElementById(edge.data.target).nonempty();
          if (!targetExists) {
            const targetNode = graph.nodes.find(
              (n) => String(n.data.id) === String(edge.data.target)
            );
            if (targetNode) {
              console.log('Adding targetNode')
              cy.add({ group: "nodes", ...targetNode });
            }
          }
        } else if (edge.data.target === nodeId) {
          const sourceExists = cy.getElementById(edge.data.source).nonempty();
          if (!sourceExists) {
            const sourceNode = graph.nodes.find(
              (n) => String(n.data.id) === String(edge.data.source)
            );
            if (sourceNode) {
              console.log('Adding sourceNode')
              cy.add({ group: "nodes", ...sourceNode });
            }
          }
        }
      });
    });
    console.log(cy.nodes());
    cy.batch(() => {
      graph.edges.forEach((edge) => {
        if (edge.data.source === nodeId || edge.data.target === nodeId) {
          if (cy.getElementById(edge.data.id).empty()) {
            const sourceExists = cy.getElementById(edge.data.source).nonempty();
            const targetExists = cy.getElementById(edge.data.target).nonempty();
            if (sourceExists && targetExists) {
              cy.add({ group: "edges", ...edge });
            } else {
              console.warn(
                `Skipping edge ${edge.data.id} because one of its nodes does not exist.`
              );
            }
          }
        }
      });
    });
    updateCyLayout(cy);
  };

  const updateCyLayout = (cy: any, fit: boolean = false) => {
    const layout = cy.layout({
      name: "cola",
      fit: fit,
      randomize: false,
      animate: true,
      padding: 30,
      nodeRepulsion: 2048,
      idealEdgeLength: 400,
      edgeElasticity: 0.5,
      gravity: 0.5,
    });
    layout.run();
  };

  const removeActivePopper = () => {
    if (activePopperRef.current) {
      const popEl = activePopperRef.current.state.elements.popper;
      if (popEl && popEl.parentNode) {
        popEl.parentNode.removeChild(popEl);
      }
      activePopperRef.current.destroy();
      activePopperRef.current = null;
      activeNodeIdRef.current = null;
    }
    if (activeFadeTimerRef.current) {
      clearTimeout(activeFadeTimerRef.current);
      activeFadeTimerRef.current = null;
    }
  }

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
            {/* {uploadProgress > 0 && uploadProgress < 100 && (
              <p className="upload-progress">Uploading... {uploadProgress}%</p>
            )} */}
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
          {selectedNodeId && (
            <div className="properties-panel">
              <h2>Node Details</h2>
              {cyRef.current && selectedNodeId && (() => {
                const node = cyRef.current
                  .nodes()
                  .find((n: any) => n.data("id") === selectedNodeId);
                if (!node) {
                  return <p>Node not found.</p>;
                }
                const nodeData = node.data();
                return Object.entries(nodeData).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}:</strong> {JSON.stringify(value)}
                  </p>
                ));
              })()}
              <button onClick={() => expandNode(selectedNodeId)}>Expand</button>
              <button onClick={() => debugNode(selectedNodeId)}>Debug</button>
              <button onClick={() => isolateNode(selectedNodeId)}>Isolate</button>
              <button onClick={() => setSelectedNodeId(null)}>Close</button>
            </div>
          )}
        </div>
      </div>
      <div className="main">
        <div className="graph-area">
          <CytoscapeComponent
            elements={[]}
            style={{ height: "100vh" }}
            cy={(cy: any) => {
              cyRef.current = cy;

              cy.on("tap", "node", (event: any) => {
                const nodeData = event.target.data();
                setSelectedNodeId(nodeData.id);
              });

              cy.on("click", (_: any) => {
                setSelectedNodeId(null);
              });

              cy.on("mouseover", "node", (event: any) => {
                const node = event.target;
                const nodeId = node.id();
              
                // If a popper already exists for this node, do nothing.
                if (activePopperRef.current && activeNodeIdRef.current === nodeId) {
                  return;
                }
                
                // If a popper exists for a different node, remove it.
                if (activePopperRef.current) {
                  removeActivePopper();
                }
                
                // Create the popper instance.
                const popperInstance = node.popper({
                  content: () => {
                    const button = document.createElement("button");
                    button.innerHTML = "+";
                    button.className = "expand-button";
                    button.onclick = (e) => {
                      e.stopPropagation();
                      expandNode(nodeId, fullGraphDataRef.current);
                      removeActivePopper();
                    };
                    document.body.appendChild(button);
                    return button;
                  },
                  popper: {
                    placement: "top",
                    strategy: "fixed",
                    modifiers: [
                      { name: "flip", enabled: false },
                      { name: "offset", options: { offset: [0, 10] } }
                    ],
                    container: document.body,
                  },
                });
                popperInstance.update();
                activePopperRef.current = popperInstance;
                activeNodeIdRef.current = nodeId;
              
                // Set a timer to fade out the popper after 1500ms,
                // then remove it completely after an additional 500ms.
                activeFadeTimerRef.current = setTimeout(() => {
                  const popEl = popperInstance.state.elements.popper;
                  if (popEl) {
                    popEl.style.transition = "opacity 0.5s";
                    popEl.style.opacity = "0";
                  }
                  setTimeout(() => {
                    removeActivePopper();
                  }, 500);
                }, 1500);
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
                    label: "data(label)",
                    "font-size": "6px",
                    "text-valign": "center",
                    "text-halign": "center",
                    "width": "20px",
                    "height": "20px",
                  },
                },
                {
                  selector: "edge",
                  style: {
                    label: "data(label)",
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
        </div>
      </div>
    </div>
  );
};

export default App;
