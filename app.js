// Inflammation Pathway Explorer App

// Register fcose layout if available
try {
    if (typeof cytoscape !== 'undefined' && typeof cytoscapeFcose !== 'undefined') {
        cytoscape.use(cytoscapeFcose);
        console.log('fcose layout registered');
    }
} catch(e) {
    console.warn('fcose layout not available, will use fallback');
}

// Layout config - use fcose if available, else cose
function getLayoutConfig(animate = false) {
    try {
        return {
            name: 'fcose',
            quality: 'proof',
            randomize: true,
            animate: animate,
            animationDuration: animate ? 1000 : 0,
            nodeDimensionsIncludeLabels: true,
            packComponents: true,
            nodeRepulsion: 8000,
            idealEdgeLength: 100,
            edgeElasticity: 0.45,
            nestingFactor: 0.1,
            gravity: 0.25,
            numIter: 2500,
            tile: true,
            tilingPaddingVertical: 20,
            tilingPaddingHorizontal: 20
        };
    } catch(e) {
        return {
            name: 'cose',
            animate: animate,
            randomize: true,
            nodeRepulsion: 8000,
            idealEdgeLength: 100
        };
    }
}

let cy;
let nodesData = [];
let edgesData = [];
let activeFilters = {
    biomarker: ['validated', 'established', 'emerging', 'none'],
    drugs: ['approved', 'pipeline', 'no-drugs'],
    druggability: ['high', 'medium', 'low', 'unknown', 'none'],
    categories: [],
    search: ''
};

// Color scheme
const COLORS = {
    validated: '#22c55e',
    established: '#3b82f6',
    emerging: '#f59e0b',
    none: '#6b7280'
};

// Category colors
const CATEGORY_COLORS = {
    'Inflammasome': '#ef4444',
    'Pattern Recognition': '#f97316',
    'JAK-STAT': '#8b5cf6',
    'NF-κB': '#ec4899',
    'Cytokines': '#06b6d4',
    'Interferons': '#14b8a6',
    'Chemokines': '#84cc16',
    'Chemokine Receptors': '#a3e635',
    'Cytokine Receptors': '#22d3d1',
    'GPCRs': '#fb923c',
    'Kinases': '#a855f7',
    'Enzymes': '#f472b6',
    'Transcription Factors': '#818cf8',
    'Cell Death': '#dc2626',
    'Checkpoints': '#0ea5e9',
    'Costimulation': '#10b981',
    'Adhesion': '#fbbf24',
    'Alarmins': '#f87171',
    'Metabolism': '#34d399',
    'Epigenetics': '#c084fc',
    'Ferroptosis': '#fb7185',
    'Resolution': '#4ade80',
    'Neuroinflammation': '#60a5fa',
    'Microbiome': '#a78bfa',
    'Complement': '#fcd34d',
    'B Cell Targets': '#2dd4bf',
    'PI3K-AKT': '#c4b5fd',
    'MAPK': '#fda4af',
    'Purinergic': '#86efac',
    'Antiviral': '#7dd3fc'
};

async function loadData() {
    try {
        // Load from app-data directory
        const [nodesRes, edgesRes] = await Promise.all([
            fetch('../app-data/nodes.json'),
            fetch('../app-data/edges.json')
        ]);
        
        nodesData = await nodesRes.json();
        edgesData = await edgesRes.json();
        
        console.log(`Loaded ${nodesData.length} nodes and ${edgesData.length} edges`);
        
        initializeApp();
    } catch (err) {
        console.error('Failed to load data:', err);
        document.getElementById('loading').innerHTML = `
            <p style="color:#ef4444">Failed to load data. Make sure you're running from a web server.</p>
            <p style="margin-top:8px;font-size:12px;color:#888">Run: python -m http.server 8080</p>
        `;
    }
}

function initializeApp() {
    // Hide loading
    document.getElementById('loading').style.display = 'none';
    
    // Update counts
    updateCounts();
    
    // Build category filters
    buildCategoryFilters();
    
    // Initialize graph
    initializeGraph();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initial filter
    applyFilters();
}

function updateCounts() {
    const counts = { validated: 0, established: 0, emerging: 0, none: 0 };
    const drugCounts = { high: 0, medium: 0, low: 0, unknown: 0, none: 0 };
    
    nodesData.forEach(n => {
        counts[n.biomarker_status]++;
        const drug = n.best_druggability || 'unknown';
        drugCounts[drug] = (drugCounts[drug] || 0) + 1;
    });
    
    document.getElementById('count-validated').textContent = counts.validated;
    document.getElementById('count-established').textContent = counts.established;
    document.getElementById('count-emerging').textContent = counts.emerging;
    document.getElementById('count-none').textContent = counts.none;
    document.getElementById('totalNodes').textContent = nodesData.length;
    
    document.getElementById('count-drug-high').textContent = drugCounts.high;
    document.getElementById('count-drug-medium').textContent = drugCounts.medium;
    document.getElementById('count-drug-low').textContent = drugCounts.low;
    document.getElementById('count-drug-unknown').textContent = drugCounts.unknown + (drugCounts.none || 0);
}

function buildCategoryFilters() {
    const categories = {};
    nodesData.forEach(n => {
        categories[n.category] = (categories[n.category] || 0) + 1;
    });
    
    // Sort by count
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';
    
    sorted.forEach(([cat, count]) => {
        const chip = document.createElement('div');
        chip.className = 'chip active';
        chip.dataset.filter = cat;
        chip.innerHTML = `${cat} <span class="chip-count">${count}</span>`;
        container.appendChild(chip);
        activeFilters.categories.push(cat);
    });
}

function initializeGraph() {
    // Build Cytoscape elements
    const elements = [];
    
    // Add nodes
    nodesData.forEach(node => {
        elements.push({
            group: 'nodes',
            data: {
                id: node.id,
                label: node.name,
                ...node
            }
        });
    });
    
    // Add edges
    edgesData.forEach(edge => {
        elements.push({
            group: 'edges',
            data: {
                id: `e${edge.id}`,
                source: edge.source,
                target: edge.target
            }
        });
    });
    
    // Initialize Cytoscape
    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'font-size': '10px',
                    'color': '#e0e0e0',
                    'text-valign': 'bottom',
                    'text-margin-y': '4px',
                    'background-color': function(ele) {
                        return COLORS[ele.data('biomarker_status')] || '#6b7280';
                    },
                    'width': function(ele) {
                        const papers = ele.data('paper_count') || 0;
                        return Math.max(20, Math.min(50, 15 + papers));
                    },
                    'height': function(ele) {
                        const papers = ele.data('paper_count') || 0;
                        return Math.max(20, Math.min(50, 15 + papers));
                    },
                    'border-width': function(ele) {
                        const approved = ele.data('drugs_approved') || [];
                        return approved.length > 0 ? 3 : 0;
                    },
                    'border-color': '#fff'
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 4,
                    'border-color': '#4a9eff'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1,
                    'line-color': '#2a2a3a',
                    'target-arrow-color': '#2a2a3a',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 0.6
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'line-color': '#4a9eff',
                    'target-arrow-color': '#4a9eff',
                    'width': 2,
                    'opacity': 1
                }
            },
            {
                selector: 'node.faded',
                style: {
                    'opacity': 0.15
                }
            },
            {
                selector: 'edge.faded',
                style: {
                    'opacity': 0.05
                }
            }
        ],
        layout: getLayoutConfig(false),
        minZoom: 0.1,
        maxZoom: 4
    });
    
    // Node click handler
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        showNodeDetails(node.data());
        
        // Highlight connections
        cy.elements().removeClass('highlighted faded');
        const neighborhood = node.neighborhood().add(node);
        cy.elements().not(neighborhood).addClass('faded');
        neighborhood.edges().addClass('highlighted');
    });
    
    // Background click
    cy.on('tap', function(evt) {
        if (evt.target === cy) {
            cy.elements().removeClass('highlighted faded');
            hideNodeDetails();
        }
    });
}

function showNodeDetails(data) {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('detailsContent').style.display = 'block';
    
    // Header
    document.getElementById('targetName').textContent = data.name;
    document.getElementById('targetType').textContent = data.type;
    document.getElementById('targetCategory').textContent = data.category;
    document.getElementById('targetGene').textContent = data.gene ? `Gene: ${data.gene}` : '';
    
    // Biomarkers
    const biomarkerList = document.getElementById('biomarkerList');
    const biomarkers = data.pd_biomarkers || [];
    
    if (biomarkers.length === 0) {
        biomarkerList.innerHTML = '<div style="color:#666;font-size:13px">No PD biomarkers identified</div>';
    } else {
        biomarkerList.innerHTML = biomarkers.map(b => {
            const drugIcon = {
                'high': '🎯',
                'medium': '📊',
                'low': '🔬',
                'none': '❌',
                'unknown': '❓'
            }[b.druggability] || '❓';
            
            const drugColor = {
                'high': '#22c55e',
                'medium': '#f59e0b',
                'low': '#6b7280',
                'none': '#ef4444',
                'unknown': '#4b5563'
            }[b.druggability] || '#4b5563';
            
            return `
            <div class="biomarker-item ${b.validation}">
                <div class="biomarker-name" style="display:flex;justify-content:space-between;align-items:center">
                    <span>${b.name}</span>
                    <span style="color:${drugColor};font-size:11px" title="Druggability: ${b.druggability}">${drugIcon} ${b.druggability || 'unknown'}</span>
                </div>
                <div class="biomarker-meta">
                    <span style="text-transform:capitalize">${b.validation}</span>
                    ${b.type ? ` • ${b.type}` : ''}
                    ${b.notes ? ` • ${b.notes}` : ''}
                </div>
                ${b.assay && b.assay !== 'Unknown' ? `<div class="biomarker-meta" style="margin-top:4px;color:#4a9eff">📋 ${b.assay}${b.assay_sensitivity ? ` (${b.assay_sensitivity})` : ''}</div>` : ''}
                ${b.assay_notes ? `<div class="biomarker-meta" style="margin-top:2px;font-style:italic">${b.assay_notes}</div>` : ''}
            </div>
        `}).join('');
    }
    
    // Drugs
    const drugList = document.getElementById('drugList');
    const approved = data.drugs_approved || [];
    const pipeline = data.drugs_pipeline || [];
    
    if (approved.length === 0 && pipeline.length === 0) {
        drugList.innerHTML = '<div style="color:#666;font-size:13px">No drugs in development</div>';
    } else {
        drugList.innerHTML = [
            ...approved.map(d => `<div class="drug-item approved">💊 ${d}</div>`),
            ...pipeline.map(d => `<div class="drug-item pipeline">🧪 ${d}</div>`)
        ].join('');
    }
    
    // Connections
    const node = cy.getElementById(data.id);
    const incomers = node.incomers('node');
    const outgoers = node.outgoers('node');
    
    document.getElementById('upstreamList').innerHTML = incomers.length === 0 
        ? '<div style="color:#666;font-size:13px">None</div>'
        : incomers.map(n => `
            <div class="connection-item" onclick="selectNode('${n.id()}')">${n.data('name')}</div>
        `).join('');
    
    document.getElementById('downstreamList').innerHTML = outgoers.length === 0
        ? '<div style="color:#666;font-size:13px">None</div>'
        : outgoers.map(n => `
            <div class="connection-item" onclick="selectNode('${n.id()}')">${n.data('name')}</div>
        `).join('');
}

function hideNodeDetails() {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('detailsContent').style.display = 'none';
}

function selectNode(id) {
    const node = cy.getElementById(id);
    if (node.length > 0) {
        cy.elements().removeClass('highlighted faded');
        const neighborhood = node.neighborhood().add(node);
        cy.elements().not(neighborhood).addClass('faded');
        neighborhood.edges().addClass('highlighted');
        
        showNodeDetails(node.data());
        cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
    }
}

function applyFilters() {
    const search = activeFilters.search.toLowerCase();
    
    cy.nodes().forEach(node => {
        const data = node.data();
        
        // Search filter
        const matchesSearch = !search || 
            data.name.toLowerCase().includes(search) ||
            data.gene?.toLowerCase().includes(search) ||
            data.id.toLowerCase().includes(search);
        
        // Biomarker filter
        const matchesBiomarker = activeFilters.biomarker.includes(data.biomarker_status);
        
        // Drug filter
        const hasApproved = (data.drugs_approved || []).length > 0;
        const hasPipeline = (data.drugs_pipeline || []).length > 0;
        const hasNoDrugs = !hasApproved && !hasPipeline;
        
        const matchesDrug = 
            (activeFilters.drugs.includes('approved') && hasApproved) ||
            (activeFilters.drugs.includes('pipeline') && hasPipeline) ||
            (activeFilters.drugs.includes('no-drugs') && hasNoDrugs);
        
        // Druggability filter
        const bestDrug = data.best_druggability || 'unknown';
        const matchesDruggability = 
            activeFilters.druggability.includes(bestDrug) ||
            (activeFilters.druggability.includes('unknown') && (bestDrug === 'unknown' || bestDrug === 'none'));
        
        // Category filter
        const matchesCategory = activeFilters.categories.includes(data.category);
        
        // Apply visibility
        const visible = matchesSearch && matchesBiomarker && matchesDrug && matchesDruggability && matchesCategory;
        node.style('display', visible ? 'element' : 'none');
    });
    
    // Update edges
    cy.edges().forEach(edge => {
        const source = edge.source();
        const target = edge.target();
        const visible = source.style('display') !== 'none' && target.style('display') !== 'none';
        edge.style('display', visible ? 'element' : 'none');
    });
    
    // Update stats
    const visibleNodes = cy.nodes().filter(n => n.style('display') !== 'none').length;
    const visibleEdges = cy.edges().filter(e => e.style('display') !== 'none').length;
    document.getElementById('visibleNodes').textContent = visibleNodes;
    document.getElementById('visibleEdges').textContent = visibleEdges;
}

function setupEventListeners() {
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        activeFilters.search = e.target.value;
        applyFilters();
    });
    
    // Biomarker filters
    document.getElementById('biomarkerFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        chip.classList.toggle('active');
        const filter = chip.dataset.filter;
        
        if (chip.classList.contains('active')) {
            activeFilters.biomarker.push(filter);
        } else {
            activeFilters.biomarker = activeFilters.biomarker.filter(f => f !== filter);
        }
        applyFilters();
    });
    
    // Drug filters
    document.getElementById('drugFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        chip.classList.toggle('active');
        const filter = chip.dataset.filter;
        
        if (chip.classList.contains('active')) {
            activeFilters.drugs.push(filter);
        } else {
            activeFilters.drugs = activeFilters.drugs.filter(f => f !== filter);
        }
        applyFilters();
    });
    
    // Druggability filters
    document.getElementById('druggabilityFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        chip.classList.toggle('active');
        const filter = chip.dataset.filter;
        
        if (chip.classList.contains('active')) {
            activeFilters.druggability.push(filter);
        } else {
            activeFilters.druggability = activeFilters.druggability.filter(f => f !== filter);
        }
        applyFilters();
    });
    
    // Category filters
    document.getElementById('categoryFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        chip.classList.toggle('active');
        const filter = chip.dataset.filter;
        
        if (chip.classList.contains('active')) {
            activeFilters.categories.push(filter);
        } else {
            activeFilters.categories = activeFilters.categories.filter(f => f !== filter);
        }
        applyFilters();
    });
    
    // Control buttons
    document.getElementById('fitBtn').addEventListener('click', () => {
        cy.fit(null, 50);
    });
    
    document.getElementById('layoutBtn').addEventListener('click', () => {
        const layout = cy.layout(getLayoutConfig(true));
        layout.run();
    });
    
    document.getElementById('resetBtn').addEventListener('click', () => {
        // Reset all filters
        document.querySelectorAll('.chip').forEach(c => c.classList.add('active'));
        document.getElementById('searchInput').value = '';
        
        activeFilters.search = '';
        activeFilters.biomarker = ['validated', 'established', 'emerging', 'none'];
        activeFilters.drugs = ['approved', 'pipeline', 'no-drugs'];
        activeFilters.druggability = ['high', 'medium', 'low', 'unknown', 'none'];
        activeFilters.categories = [];
        document.querySelectorAll('#categoryFilters .chip').forEach(c => {
            activeFilters.categories.push(c.dataset.filter);
        });
        
        applyFilters();
        cy.elements().removeClass('highlighted faded');
        hideNodeDetails();
        cy.fit(null, 50);
    });
}

// Start app
loadData();
