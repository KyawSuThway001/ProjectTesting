// PowerPoint Viewer with PDF-like functionality
class PowerPointViewer {
    constructor() {
        this.currentPage = 1;
        this.totalPages = 1;
        this.zoomLevel = 100;
        this.rotation = 0;
        this.isAnnotationMode = false;
        this.history = [];
        this.historyIndex = -1;

        this.init();
    }

    init() {
        this.bindEvents();
        this.updateUI();
    }

    bindEvents() {
        // Menu toggle
        const sidenavToggle = document.getElementById('sidenavToggle');
        if (sidenavToggle) {
            sidenavToggle.addEventListener('click', () => this.toggleSidenav());
        }

        // Page navigation
        const pageInput = document.querySelector('.page-input');
        if (pageInput) {
            pageInput.addEventListener('change', (e) => this.goToPage(parseInt(e.target.value)));
            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.goToPage(parseInt(e.target.value));
                }
            });
        }

        // Zoom controls
        const zoomOut = document.querySelector('.icon-btn-remove');
        const zoomIn = document.querySelector('.icon-btn-add');
        const zoomInput = document.querySelector('.zoom-input');

        if (zoomOut) zoomOut.addEventListener('click', () => this.zoomOut());
        if (zoomIn) zoomIn.addEventListener('click', () => this.zoomIn());
        if (zoomInput) {
            zoomInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value.replace('%', ''));
                this.setZoom(value);
            });
        }

        // Fit to width
        const fitBtn = document.getElementById('fit');
        if (fitBtn) {
            fitBtn.addEventListener('click', () => this.fitToWidth());
        }

        // Rotation
        const rotateBtn = document.getElementById('rotate');
        if (rotateBtn) {
            rotateBtn.addEventListener('click', () => this.rotate());
        }

        // Annotation mode
        const annotateBtn = document.getElementById('annotate');
        if (annotateBtn) {
            annotateBtn.addEventListener('click', () => this.toggleAnnotation());
        }

        // Undo/Redo
        const undoBtn = document.getElementById('undo');
        const redoBtn = document.getElementById('redo');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());

        // Download and Print
        const downloadBtn = document.querySelector('[title="Download"]');
        const printBtn = document.querySelector('[title="Print"]');
        if (downloadBtn) downloadBtn.addEventListener('click', () => this.download());
        if (printBtn) printBtn.addEventListener('click', () => this.print());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Mouse wheel zoom (like PDF viewers)
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            }
        });
    }

    // Page Navigation
    goToPage(pageNumber) {
        if (pageNumber >= 1 && pageNumber <= this.totalPages) {
            this.currentPage = pageNumber;
            this.updateUI();
            this.renderPage();
            this.saveState();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    // Zoom functionality
    zoomIn() {
        const newZoom = Math.min(this.zoomLevel + 25, 500);
        this.setZoom(newZoom);
    }

    zoomOut() {
        const newZoom = Math.max(this.zoomLevel - 25, 25);
        this.setZoom(newZoom);
    }

    setZoom(level) {
        this.zoomLevel = Math.max(25, Math.min(500, level));
        this.updateUI();
        this.applyZoom();
        this.saveState();
    }

    fitToWidth() {
        // Calculate zoom to fit content width
        const container = document.querySelector('.slide-container') || document.querySelector('.presentation-content') || document.body;
        const content = document.querySelector('.slide-content') || document.querySelector('.presentation-content');

        if (container && content) {
            const containerWidth = container.clientWidth - 40; // Account for padding
            const contentWidth = content.scrollWidth || 800; // Get actual content width
            const fitZoom = Math.floor((containerWidth / contentWidth) * 100);
            this.setZoom(Math.max(25, Math.min(500, fitZoom)));
        } else {
            // Fallback: assume standard presentation width
            const viewportWidth = window.innerWidth - 100; // Account for UI
            const standardWidth = 1024; // Standard presentation width
            const fitZoom = Math.floor((viewportWidth / standardWidth) * 100);
            this.setZoom(Math.max(25, Math.min(200, fitZoom)));
        }

        // Visual feedback
        const fitBtn = document.getElementById('fit');
        if (fitBtn) {
            fitBtn.classList.add('active');
            setTimeout(() => fitBtn.classList.remove('active'), 200);
        }
    }

    applyZoom() {
        const content = document.querySelector('.slide-content') || document.querySelector('.presentation-content');
        if (content) {
            content.style.transform = `scale(${this.zoomLevel / 100}) rotate(${this.rotation}deg)`;
            content.style.transformOrigin = 'top left';
        }
    }

    // Rotation
    rotate() {
        this.rotation = (this.rotation + 90) % 360;
        this.applyZoom();
        this.saveState();

        // Visual feedback
        const rotateBtn = document.getElementById('rotate');
        if (rotateBtn) {
            rotateBtn.style.transform = `rotate(${this.rotation}deg)`;
        }
    }

    // Annotation mode
    toggleAnnotation() {
        this.isAnnotationMode = !this.isAnnotationMode;
        const annotateBtn = document.getElementById('annotate');
        if (annotateBtn) {
            annotateBtn.classList.toggle('active', this.isAnnotationMode);
        }

        // Enable/disable drawing on slides
        if (this.isAnnotationMode) {
            this.enableDrawing();
        } else {
            this.disableDrawing();
        }
    }

    enableDrawing() {
        // Add drawing canvas overlay
        const slideContainer = document.querySelector('.slide-container') || document.body;
        if (!document.getElementById('drawing-canvas')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'drawing-canvas';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'crosshair';
            slideContainer.appendChild(canvas);

            this.setupDrawing(canvas);
        }
    }

    disableDrawing() {
        const canvas = document.getElementById('drawing-canvas');
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        }
    }

    setupDrawing(canvas) {
        const ctx = canvas.getContext('2d');
        let isDrawing = false;

        canvas.addEventListener('mousedown', (e) => {
            if (this.isAnnotationMode) {
                isDrawing = true;
                ctx.beginPath();
                ctx.moveTo(e.offsetX, e.offsetY);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (isDrawing && this.isAnnotationMode) {
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
            }
        });

        canvas.addEventListener('mouseup', () => {
            if (isDrawing) {
                isDrawing = false;
                this.saveState();
            }
        });
    }

    // Undo/Redo functionality
    saveState() {
        const state = {
            page: this.currentPage,
            zoom: this.zoomLevel,
            rotation: this.rotation,
            timestamp: Date.now()
        };

        // Remove future states if we're not at the end
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        this.historyIndex = this.history.length - 1;

        // Limit history size
        if (this.history.length > 50) {
            this.history = this.history.slice(-50);
            this.historyIndex = this.history.length - 1;
        }

        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(state) {
        this.currentPage = state.page;
        this.zoomLevel = state.zoom;
        this.rotation = state.rotation;
        this.updateUI();
        this.applyZoom();
        this.renderPage();
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo');
        const redoBtn = document.getElementById('redo');

        if (undoBtn) {
            undoBtn.disabled = this.historyIndex <= 0;
        }
        if (redoBtn) {
            redoBtn.disabled = this.historyIndex >= this.history.length - 1;
        }
    }

    // Keyboard shortcuts
    handleKeyboard(e) {
        // Prevent default browser shortcuts
        if (e.ctrlKey) {
            switch(e.key) {
                case '=':
                case '+':
                    e.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    this.zoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    this.setZoom(100);
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 'p':
                    e.preventDefault();
                    this.print();
                    break;
            }
        }

        // Navigation shortcuts
        switch(e.key) {
            case 'ArrowRight':
            case 'PageDown':
                e.preventDefault();
                this.nextPage();
                break;
            case 'ArrowLeft':
            case 'PageUp':
                e.preventDefault();
                this.previousPage();
                break;
            case 'Home':
                e.preventDefault();
                this.goToPage(1);
                break;
            case 'End':
                e.preventDefault();
                this.goToPage(this.totalPages);
                break;
            case 'Escape':
                if (this.isAnnotationMode) {
                    this.toggleAnnotation();
                }
                break;
        }
    }

    // Utility functions
    toggleSidenav() {
        // Enhanced sidebar functionality
        const sidenav = document.getElementById('sidenav') ||
                       document.querySelector('.sidenav') ||
                       document.querySelector('.sidebar') ||
                       this.createSideNav(); // Create if doesn't exist

        const toggle = document.getElementById('sidenavToggle');
        const isExpanded = toggle && toggle.getAttribute('aria-expanded') === 'true';

        if (sidenav) {
            // Toggle sidebar visibility
            if (!isExpanded) {
                sidenav.style.display = 'block';
                sidenav.classList.add('open');
                sidenav.style.transform = 'translateX(0)';
                document.body.style.marginLeft = sidenav.offsetWidth + 'px';
            } else {
                sidenav.classList.remove('open');
                sidenav.style.transform = 'translateX(-100%)';
                document.body.style.marginLeft = '0';
                setTimeout(() => {
                    if (!sidenav.classList.contains('open')) {
                        sidenav.style.display = 'none';
                    }
                }, 300);
            }

            // Update button state
            if (toggle) {
                toggle.setAttribute('aria-expanded', !isExpanded);
                toggle.classList.toggle('active', !isExpanded);
            }
        }
    }

    createSideNav() {
        // Create a basic sidebar if one doesn't exist
        const sidenav = document.createElement('div');
        sidenav.id = 'sidenav';
        sidenav.className = 'sidenav';
        sidenav.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 250px;
            height: 100vh;
            background: #f5f5f5;
            border-right: 1px solid #ddd;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 1000;
            padding: 60px 20px 20px;
            box-sizing: border-box;
            display: none;
        `;

        // Add slide thumbnails or navigation
        sidenav.innerHTML = `
            <h3>Slides</h3>
            <div class="slide-thumbnails">
                ${Array.from({length: this.totalPages}, (_, i) => `
                    <div class="thumbnail-slide" data-slide="${i + 1}" onclick="window.pptViewer.goToPage(${i + 1})">
                        <div class="thumbnail-content">Slide ${i + 1}</div>
                    </div>
                `).join('')}
            </div>
            <style>
                .thumbnail-slide {
                    padding: 8px;
                    margin: 4px 0;
                    border: 1px solid #ddd;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: background-color 0.2s;
                }
                .thumbnail-slide:hover {
                    background-color: #e9e9e9;
                }
                .thumbnail-slide.active {
                    background-color: #007acc;
                    color: white;
                }
                .thumbnail-content {
                    font-size: 12px;
                    text-align: center;
                    padding: 20px 10px;
                    background: white;
                    border-radius: 2px;
                }
            </style>
        `;

        document.body.appendChild(sidenav);
        return sidenav;
    }

    download() {
        // Create a download link for the current presentation
        try {
            const title = document.getElementById('title').textContent || 'presentation';
            const filename = title.replace(/Microsoft PowerPoint - /, '').replace(/ - Compatibility Mode/, '') || 'presentation.pptx';

            // Method 1: If you have the file URL
            const fileUrl = this.getFileUrl(); // You'd implement this based on your setup
            if (fileUrl) {
                const link = document.createElement('a');
                link.href = fileUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }

            // Method 2: Generate from current content (fallback)
            this.downloadAsHTML(filename);

        } catch (error) {
            console.error('Download failed:', error);
            alert('Download functionality requires server setup. Please contact administrator.');
        }
    }

    getFileUrl() {
        // Return the URL of the original file if available
        // This would be set based on your application's file storage
        return window.fileUrl || null; // You'd set this when loading the presentation
    }

    downloadAsHTML(filename) {
        // Export current view as HTML (fallback method)
        const content = document.documentElement.outerHTML;
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename.replace('.pptx', '.html');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    print() {
        // Enhanced print functionality
        const originalTitle = document.title;
        const presentationTitle = document.getElementById('title')?.textContent || 'Presentation';

        // Set page title for print
        document.title = presentationTitle.replace(/Microsoft PowerPoint - /, '').replace(/ - Compatibility Mode/, '');

        // Hide toolbar and UI elements for printing
        const elementsToHide = [
            '#toolbar',
            '.sidenav',
            '.controls',
            '#drawing-canvas'
        ];

        const hiddenElements = [];
        elementsToHide.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el && el.style.display !== 'none') {
                    hiddenElements.push({ element: el, originalDisplay: el.style.display });
                    el.style.display = 'none';
                }
            });
        });

        // Apply print styles
        const printStyles = document.createElement('style');
        printStyles.id = 'print-styles';
        printStyles.textContent = `
            @media print {
                body { margin: 0; padding: 20px; }
                .slide-content, .presentation-content {
                    transform: none !important;
                    max-width: 100% !important;
                    page-break-after: always;
                }
                .page-break { page-break-before: always; }
            }
        `;
        document.head.appendChild(printStyles);

        // Trigger print
        setTimeout(() => {
            window.print();

            // Restore after print dialog closes
            setTimeout(() => {
                // Restore hidden elements
                hiddenElements.forEach(({ element, originalDisplay }) => {
                    element.style.display = originalDisplay;
                });

                // Remove print styles
                const styles = document.getElementById('print-styles');
                if (styles) styles.remove();

                // Restore original title
                document.title = originalTitle;
            }, 500);
        }, 100);
    }

    renderPage() {
        // Enhanced page rendering with actual functionality
        const currentSlide = document.querySelector(`[data-slide="${this.currentPage}"]`) ||
                           document.querySelector('.current-slide') ||
                           document.querySelector('.slide-content');

        if (currentSlide) {
            // Hide all slides
            const allSlides = document.querySelectorAll('[data-slide], .slide');
            allSlides.forEach(slide => {
                slide.style.display = 'none';
                slide.classList.remove('active', 'current-slide');
            });

            // Show current slide
            currentSlide.style.display = 'block';
            currentSlide.classList.add('active', 'current-slide');

            // Apply current transformations
            this.applyZoom();

            // Update slide counter in UI
            this.updateSlideCounter();

            // Trigger slide change event for any listeners
            const event = new CustomEvent('slideChanged', {
                detail: {
                    currentPage: this.currentPage,
                    totalPages: this.totalPages
                }
            });
            document.dispatchEvent(event);
        } else {
            // If no specific slide structure, just update the display
            console.log(`Displaying slide ${this.currentPage} of ${this.totalPages}`);

            // You can implement your specific slide loading logic here
            // For example: loadSlideFromServer(this.currentPage);
        }
    }

    updateSlideCounter() {
        // Update any slide counter displays
        const counters = document.querySelectorAll('.slide-counter, .page-counter');
        counters.forEach(counter => {
            counter.textContent = `${this.currentPage} / ${this.totalPages}`;
        });
    }

    updateUI() {
        // Update page input
        const pageInput = document.querySelector('.page-input');
        if (pageInput) {
            pageInput.value = this.currentPage;
        }

        // Update page total
        const pageTotal = document.querySelector('.page-total');
        if (pageTotal) {
            pageTotal.textContent = `/ ${this.totalPages}`;
        }

        // Update zoom input
        const zoomInput = document.querySelector('.zoom-input');
        if (zoomInput) {
            zoomInput.value = `${this.zoomLevel}%`;
        }

        this.updateUndoRedoButtons();
    }

    // Public methods for external control
    setTotalPages(total) {
        this.totalPages = total;
        this.updateUI();
    }

    getCurrentState() {
        return {
            page: this.currentPage,
            totalPages: this.totalPages,
            zoom: this.zoomLevel,
            rotation: this.rotation,
            isAnnotationMode: this.isAnnotationMode
        };
    }
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pptViewer = new PowerPointViewer();

    // Example: Set total pages (you would get this from your data)
    // window.pptViewer.setTotalPages(25);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PowerPointViewer;
}

// JS to handle "Enter" press
document.getElementById('searchForm').addEventListener('submit', function(e) {
    e.preventDefault(); // prevent form from refreshing the page
    const query = document.getElementById('searchInput').value;
    console.log('Searching for:', query); // replace with your search function
    // Example: window.location.href = `/search?q=${encodeURIComponent(query)}`;
});