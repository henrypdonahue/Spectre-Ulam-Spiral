const ident = [1,0,0,0,1,0];

let to_screen = [20, 0, 0, 0, -20, 0];
let lw_scale = 1;

let sys;

let scale_centre;
let scale_start;
let scale_ts;

let reset_but;
let tile_sel;
let shape_sel;
let colscheme_sel;

let subst_button;
let dragging = false;
let uibox = true;

const tile_names = [ 
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi',
    'Pi', 'Sigma', 'Phi', 'Psi' ];

let colmap = {
    'Gamma': [249, 246, 238],
    'Gamma1': [249, 246, 238],
    'Gamma2':[249, 246, 238],
    'Delta':[249, 246, 238],
    'Theta':[249, 246, 238],
    'Lambda':[249, 246, 238],
    'Xi':[249, 246, 238],
    'Pi':[249, 246, 238],
    'Sigma':[249, 246, 238],
    'Phi':[249, 246, 238],
    'Psi':[249, 246, 238],
};

function pt( x, y ){
    return { x : x, y : y };
}

function inv( T ) {
    const det = T[0]*T[4] - T[1]*T[3];
    return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
            -T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
};

function mul( A, B ){
    return [A[0]*B[0] + A[1]*B[3], 
            A[0]*B[1] + A[1]*B[4],
            A[0]*B[2] + A[1]*B[5] + A[2],
            A[3]*B[0] + A[4]*B[3], 
            A[3]*B[1] + A[4]*B[4],
            A[3]*B[2] + A[4]*B[5] + A[5]];
}

function padd( p, q ){
    return { x : p.x + q.x, y : p.y + q.y };
}

function psub( p, q ){
    return { x : p.x - q.x, y : p.y - q.y };
}

function pframe( o, p, q, a, b ){
    return { x : o.x + a*p.x + b*q.x, y : o.y + a*p.y + b*q.y };
}

function trot( ang ){
    const c = cos( ang );
    const s = sin( ang );
    return [c, -s, 0, s, c, 0];
}

function ttrans( tx, ty ) {
    return [1, 0, tx, 0, 1, ty];
}

function transTo( p, q ){
    return ttrans( q.x - p.x, q.y - p.y );
}

function rotAbout( p, ang ){
    return mul( ttrans( p.x, p.y ), 
                mul( trot( ang ), ttrans( -p.x, -p.y ) ) );
}

function transPt( M, P ){
    return pt(M[0]*P.x + M[1]*P.y + M[2], M[3]*P.x + M[4]*P.y + M[5]);
}

function matchSeg( p, q ){
    return [q.x-p.x, p.y-q.y, p.x,  q.y-p.y, q.x-p.x, p.y];
};

function matchTwo( p1, q1, p2, q2 ){
    return mul( matchSeg( p2, q2 ), inv( matchSeg( p1, q1 ) ) );
};

function drawPolygon( shape, T, f, s, w ){
    if( f != null ) {
        fill( ...f );
    } else {
        noFill();
    }
    if( s != null ) {
        stroke( 255 );
        strokeWeight( w );
    } else {
        noStroke();
    }
    beginShape();
    for( let p of shape ) {
        const tp = transPt( T, p );
        vertex( tp.x, tp.y );
    }
    endShape( CLOSE );
}


let globalTileCounter = 1;

class Shape {
    constructor(pts, quad, label) {
        this.pts = pts;
        this.quad = quad;
        this.label = label;
        this.number = -1;
        this.isBlack = false;
    }

    draw(S) {
        const color = this.isBlack ? [0,0,0] : colmap[this.label];
        drawPolygon(this.pts, S, color, [0, 0, 0], 0.1);

        const center = this.pts.reduce(
            (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
            { x: 0, y: 0 }
        );
        center.x /= this.pts.length;
        center.y /= this.pts.length;

        const transformedCenter = transPt(S, center);

        push();
        translate(transformedCenter.x, transformedCenter.y);
        rotate(PI);
        scale(-1, 1);
        // Before drawing the text number:
        if (this.isBlack) {
            // Prime: black tile, white text
            fill(255); 
        } else {
            // Non-prime: use black text on the light tiles
            fill(0);
        }
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(1);
        text(this.number, 0, 0);
        pop();
    }

    streamSVG(S, stream) {
        let s = '<polygon points="';
        for (let p of this.pts) {
            const sp = transPt(S, p);
            s += `${sp.x},${sp.y} `;
        }
        const col = this.isBlack ? [0,0,0] : colmap[this.label];
        s += `" stroke="white" stroke-weight="0.1" fill="rgb(${col[0]},${col[1]},${col[2]})" />`;
        stream.push(s);

        const center = this.pts.reduce(
            (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
            { x: 0, y: 0 }
        );
        center.x /= this.pts.length;
        center.y /= this.pts.length;
        const transformedCenter = transPt(S, center);
        stream.push(
            `<text x="${transformedCenter.x}" y="${transformedCenter.y}" text-anchor="middle" alignment-baseline="middle" font-size="10" fill="black">${this.number}</text>`
        );
    }
}




class Meta {
    constructor() {
        this.geoms = [];
        this.quad = [];
    }

    // addChild: Adds a geometry (Shape or Meta) as a child to this Meta,
    // transforming it by T if needed and storing in geoms.
    addChild(g, T) {
        if (g instanceof Shape) {
            const newShape = new Shape(g.pts, g.quad, g.label);
            this.geoms.push({ geom: newShape, xform: T });
        } else if (g instanceof Meta) {
            g.geoms.forEach((child) => {
                if (child.geom instanceof Shape) {
                    const newShape = new Shape(child.geom.pts, child.geom.quad, child.geom.label);
                    this.geoms.push({ geom: newShape, xform: mul(T, child.xform) });
                } else if (child.geom instanceof Meta) {
                    const newMeta = new Meta();
                    newMeta.addChild(child.geom, mul(T, child.xform));
                    this.geoms.push({ geom: newMeta, xform: T });
                }
            });
        }
    }

    // getAllShapes: Recursively collects all Shapes from this Meta and nested Metas,
    // applying transformations along the way, returning a flat list of {shape, xform}.
    getAllShapes() {
        let shapes = [];
        for (let g of this.geoms) {
            if (g.geom instanceof Shape) {
                shapes.push({ shape: g.geom, xform: g.xform });
            } else if (g.geom instanceof Meta) {
                const sub = g.geom.getAllShapes();
                for (let s of sub) {
                    s.xform = mul(g.xform, s.xform);
                }
                shapes = shapes.concat(sub);
            }
        }
        return shapes;
    }

    // shapeCentroid: Computes the centroid of a shape (given by its pts)
    // after applying a transformation xform.
    shapeCentroid(shape, xform) {
        const c = shape.pts.reduce((acc, p) => {
            const tp = transPt(xform, p);
            return { x: acc.x + tp.x, y: acc.y + tp.y };
        }, { x: 0, y: 0 });
        c.x /= shape.pts.length;
        c.y /= shape.pts.length;
        return c;
    }

    // shareEdge: Checks if two shapes A and B share an identical edge (after transformations),
    // meaning they are edge-adjacent.
    shareEdge(A, Ax, B, Bx) {
        const dist = (a,b)=>(a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y);

        const Aedges = [];
        for (let i = 0; i < A.pts.length; i++) {
            const p1 = transPt(Ax, A.pts[i]);
            const p2 = transPt(Ax, A.pts[(i+1)%A.pts.length]);
            Aedges.push([p1,p2]);
        }

        for (let j = 0; j < B.pts.length; j++) {
            const q1 = transPt(Bx, B.pts[j]);
            const q2 = transPt(Bx, B.pts[(j+1)%B.pts.length]);
            for (let [p1,p2] of Aedges) {
                const match = ((dist(p1,q1)<1e-12 && dist(p2,q2)<1e-12) ||
                               (dist(p1,q2)<1e-12 && dist(p2,q1)<1e-12));
                if (match) return true;
            }
        }
        return false;
    }

    // shareCorner: Checks if two shapes share a single corner point (like a 4-way corner),
    // if they share a point with small tolerance, consider them touching at a corner.
    shareCorner(A, Ax, B, Bx) {
        const dist = (a,b)=>(a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y);
        const Apts = A.pts.map(p=>transPt(Ax,p));
        const Bpts = B.pts.map(p=>transPt(Bx,p));

        for (let pa of Apts) {
            for (let pb of Bpts) {
                if (dist(pa,pb)<1e-12) {
                    return true;
                }
            }
        }
        return false;
    }

    // computeAdjacency: Builds an adjacency list for all shapes,
    // determining which shapes are adjacent (share an edge) or share a corner point.
    computeAdjacency(shapes) {
        const adjacency = Array.from({length: shapes.length}, () => []);
        for (let i = 0; i < shapes.length; i++) {
            for (let j = i+1; j < shapes.length; j++) {
                const A=shapes[i].shape,Ax=shapes[i].xform;
                const B=shapes[j].shape,Bx=shapes[j].xform;
                // First check edge sharing
                if (this.shareEdge(A,Ax,B,Bx)) {
                    adjacency[i].push(j);
                    adjacency[j].push(i);
                } else {
                    // If no edge, check if they share a corner
                    if (this.shareCorner(A,Ax,B,Bx)) {
                        adjacency[i].push(j);
                        adjacency[j].push(i);
                    }
                }
            }
        }
        return adjacency;
    }

    // isPrime: Checks if n is prime, used for marking prime tiles.
    isPrime(n) {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        for (let i = 5; i*i <= n; i += 6) {
            if (n % i === 0 || n % (i+2) === 0) return false;
        }
        return true;
    }



  assignSpiralNumbers() {
        const shapes = this.getAllShapes();
        if (shapes.length === 0) return;

        const centroids = shapes.map(s => this.shapeCentroid(s.shape, s.xform));
        const adjacency = this.computeAdjacency(shapes);

        // Find #1: tile closest to global center
        let avgX=0, avgY=0;
        for (let c of centroids) { avgX+=c.x; avgY+=c.y; }
        avgX/=centroids.length; avgY/=centroids.length;
        const globalCenter={x:avgX,y:avgY};

        let centerIndex=0,minDist=Infinity;
        for (let i=0;i<centroids.length;i++){
            const dx=centroids[i].x-globalCenter.x;
            const dy=centroids[i].y-globalCenter.y;
            const d=dx*dx+dy*dy;
            if(d<minDist){minDist=d;centerIndex=i;}
        }

        let globalTileCounter=1;
        shapes[centerIndex].shape.number=globalTileCounter++;
        const visited=new Set([centerIndex]);
        const c1=centroids[centerIndex];
        const angleC=(idx)=>atan2(centroids[idx].y-c1.y, centroids[idx].x-c1.x);

        const findCandidatesTouching=(baseSet)=>{
            const base=new Set(baseSet);
            const res=[];
            for (let i=0;i<shapes.length;i++){
                if(!visited.has(i)){
                    if(adjacency[i].some(x=>base.has(x))) res.push(i);
                }
            }
            return res;
        };

        const arrangeFrom3OClock=(candidates, referenceIndex)=>{
            candidates=[...new Set(candidates)];
            if(candidates.length===0) return candidates;
            candidates.sort((a,b)=>angleC(a)-angleC(b));
            let bestDiff=Infinity;let startI=0;
            for (let i=0;i<candidates.length;i++){
                let diff=angleC(candidates[i])-0;
                diff=atan2(sin(diff),cos(diff));
                const absd=abs(diff);
                if(absd<bestDiff){bestDiff=absd;startI=i;}
            }
            const front=candidates.slice(startI);
            const back=candidates.slice(0,startI);
            return front.concat(back);
        };

        // // Place a ring
        // // For the first ring: each tile must touch #1 and lastPlaced (continuity)
        // // For subsequent rings: each tile must touch lastPlaced and at least one tile in baseRing
        // const placeRing=(baseRing, mustTouchCenter=false)=>{
        //     let cands = findCandidatesTouching(baseRing);
        //     console.log(cands)
        //     if(cands.length===0) return [];

        //     const ordered=arrangeFrom3OClock(cands, centerIndex);

        //     let ringPlaced=[];
        //     let lastPlaced = baseRing[baseRing.length-1];
        //     // For the first ring, start continuity from #1
        //     if(mustTouchCenter) lastPlaced=centerIndex;

        //     // Convert baseRing to a set for quick checks
        //     const baseSet = new Set(baseRing);

        //     for (let c of ordered) {
        //         if(visited.has(c)) continue;
        //         // must touch lastPlaced
        //         if(!adjacency[c].includes(lastPlaced)) continue;
        //         // if first ring, must also touch #1
        //         if(mustTouchCenter && !adjacency[c].includes(centerIndex)) continue;
        //         // if not first ring, must also touch at least one tile in baseRing
        //         // to ensure it doesn't just extend from n-1
        //         if(!mustTouchCenter) {
        //             if(!adjacency[c].some(x=>baseSet.has(x))) continue;
        //         }

        //         shapes[c].shape.number=globalTileCounter++;
        //         visited.add(c);
        //         ringPlaced.push(c);
        //         lastPlaced=c;
        //     }

        //     return ringPlaced;
        // };

        const placeRing = (baseRing, mustTouchCenter = false) => {
            let cands = findCandidatesTouching(baseRing);
            if (cands.length === 0) return [];
        
            // Sort candidates to find the next closest to "3 o'clock" direction
            const ordered = arrangeFrom3OClock(cands, centerIndex);
        
            let ringPlaced = [];
            let lastPlaced = baseRing[baseRing.length - 1];
            const baseSet = new Set(baseRing);
        
            for (let c of ordered) {
                if (visited.has(c)) continue;
        
                // Ensure candidate touches the last placed tile
                if (!adjacency[c].includes(lastPlaced)) continue;
        
                // Must touch the global center (first ring)
                if (mustTouchCenter && !adjacency[c].includes(centerIndex)) continue;
        
                // Must touch at least one tile in the base ring for continuity
                if (!mustTouchCenter && !adjacency[c].some((x) => baseSet.has(x))) continue;
        
                // Assign the next tile number
                shapes[c].shape.number = globalTileCounter++;
                visited.add(c);
                ringPlaced.push(c);
                lastPlaced = c;
            }
        
            return ringPlaced;
        };
        

        // First ring around #1
        const firstRing = placeRing([centerIndex], true);
        if(firstRing.length===0){
            // no ring formed, just number leftover
            for(let i=0;i<shapes.length;i++){
                if(shapes[i].shape.number===-1)shapes[i].shape.number=globalTileCounter++;
            }
            for(let s of shapes){
                if(s.shape.number>0 && this.isPrime(s.shape.number))s.shape.isBlack=true;
            }
            return;
        }

        let prevRing = [centerIndex,...firstRing];

        // subsequent rings
        while(true){
            const newRing = placeRing(prevRing,false);
            if(newRing.length===0) break;
            prevRing = [...prevRing, ...newRing];
        }

        // now all placed
        for(let i=0;i<shapes.length;i++){
            if(shapes[i].shape.number===-1)shapes[i].shape.number=globalTileCounter++;
        }

        for(let s of shapes){
            if(s.shape.number>0 && this.isPrime(s.shape.number)){
                s.shape.isBlack=true;
            }
        }
    }



    draw(S) {
        for (let g of this.geoms) {
            g.geom.draw(mul(S, g.xform));
        }
    }

    streamSVG(S, stream) {
        for (let g of this.geoms) {
            g.geom.streamSVG(mul(S, g.xform), stream);
        }
    }
}


function buildSpectreBase() {
    const spectre = [
        pt(0, 0),
        pt(1.0, 0.0),
        pt(1.5, -0.8660254037844386),
        pt(2.366025403784439, -0.36602540378443865),
        pt(2.366025403784439, 0.6339745962155614),
        pt(3.366025403784439, 0.6339745962155614),
        pt(3.866025403784439, 1.5),
        pt(3.0, 2.0),
        pt(2.133974596215561, 1.5),
        pt(1.6339745962155614, 2.3660254037844393),
        pt(0.6339745962155614, 2.3660254037844393),
        pt(-0.3660254037844386, 2.3660254037844393),
        pt(-0.866025403784439, 1.5),
        pt(0.0, 1.0),
    ];

    const spectre_keys = [spectre[3], spectre[5], spectre[7], spectre[11]];

    const ret = {};

    for (let lab of ['Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi']) {
        const tile = new Shape(spectre, spectre_keys, lab);
        ret[lab] = tile;
    }

    const mystic = new Meta();
    mystic.addChild(new Shape(spectre, spectre_keys, 'Gamma1'), ident);
    mystic.addChild(
        new Shape(spectre, spectre_keys, 'Gamma2'),
        mul(ttrans(spectre[8].x, spectre[8].y), trot(PI / 6))
    );

    mystic.quad = spectre_keys;
    ret['Gamma'] = mystic;

    return ret;
}
function buildSupertiles(sys) {
    const quad = sys['Delta'].quad;
    const R = [-1, 0, 0, 0, 1, 0];

    const t_rules = [
        [60, 3, 1],
        [0, 2, 0],
        [60, 3, 1],
        [60, 3, 1],
        [0, 2, 0],
        [60, 3, 1],
        [-120, 3, 3],
    ];

    const Ts = [ident];
    let total_ang = 0;
    let rot = ident;
    const tquad = [...quad];

    // Precompute transformations for all tile positions
    for (const [ang, from, to] of t_rules) {
        total_ang += ang;
        if (ang !== 0) {
            rot = trot(radians(total_ang));
            for (let i = 0; i < 4; ++i) {
                tquad[i] = transPt(rot, quad[i]);
            }
        }

        const ttt = transTo(
            tquad[to],
            transPt(Ts[Ts.length - 1], quad[from])
        );
        Ts.push(mul(ttt, rot));
    }

    for (let idx = 0; idx < Ts.length; ++idx) {
        Ts[idx] = mul(R, Ts[idx]);
    }

    const super_rules = {
        Gamma: ['Pi', 'Delta', null, 'Theta', 'Sigma', 'Xi', 'Phi', 'Gamma'],
        Delta: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
        Theta: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
        Lambda: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
        Xi: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
        Pi: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
        Sigma: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Lambda', 'Gamma'],
        Phi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
        Psi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
    };

    const super_quad = [
        transPt(Ts[6], quad[2]),
        transPt(Ts[5], quad[1]),
        transPt(Ts[3], quad[2]),
        transPt(Ts[0], quad[1]),
    ];

    const ret = {};

    // Construct supertiles lazily
    for (const [lab, subs] of Object.entries(super_rules)) {
        const sup = new Meta();

        // Optimize: Skip null tiles and apply transformations only when needed
        for (let idx = 0; idx < subs.length; ++idx) {
            if (subs[idx] === null) continue;

            const child = sys[subs[idx]];
            sup.addChild(child, Ts[idx]);
        }

        sup.quad = super_quad;
        ret[lab] = sup;
    }

    return ret;
}

function setup() {
    createCanvas( windowWidth, windowHeight );

    sys = buildSpectreBase();

    let lab = createSpan( 'Shapes' );
    lab.position( 10, 10 );
    lab.size( 125, 15 );

    shape_sel = createSelect();
    shape_sel.position( 10, 30 );
    shape_sel.size( 125, 25 );
    shape_sel.option( 'Tile(1,1)' );
    shape_sel.option( 'Hexagons' );
    shape_sel.changed( function() {
        const s = shape_sel.value();
        if( s == 'Hexagons' ) {
            sys = buildHexBase();
        } else {
            sys = buildSpectreBase();
        }
        to_screen = [20, 0, 0, 0, -20, 0];
        lw_scale = 1;
        globalTileCounter = 1;
        if (sys[tile_sel.value()] instanceof Meta) {
            sys[tile_sel.value()].assignSpiralNumbers();
        } else if (sys[tile_sel.value()] instanceof Shape) {
            sys[tile_sel.value()].number = globalTileCounter++;
        }
        loop();
    } );

    reset_but = createButton("Reset");
    reset_but.position(10, 260);
    reset_but.size(125, 25);
    reset_but.mousePressed(function () {
        const currentShape = shape_sel.value(); 
        const currentTile = tile_sel.value(); 

        if (currentShape === 'Hexagons') {
            sys = buildHexBase();
        } else {
            sys = buildSpectreBase();
        }

        to_screen = [20, 0, 0, 0, -20, 0];
        lw_scale = 0.2;

        tile_sel.value(currentTile);

        globalTileCounter = 1;
        if (sys[tile_sel.value()] instanceof Meta) {
            sys[tile_sel.value()].assignSpiralNumbers();
        } else if (sys[tile_sel.value()] instanceof Shape) {
            sys[tile_sel.value()].number = globalTileCounter++;
        }

        loop();
    });

    subst_button = createButton( "Build Supertiles" );
    subst_button.position( 10, 60 );
    subst_button.size( 125, 25 );
    subst_button.mousePressed( function() {
        sys = buildSupertiles( sys ); 
        globalTileCounter = 1;
        if (sys[tile_sel.value()] instanceof Meta) {
            sys[tile_sel.value()].assignSpiralNumbers();
        } else if (sys[tile_sel.value()] instanceof Shape) {
            sys[tile_sel.value()].number = globalTileCounter++;
        }
        loop();
    } );

    lab = createSpan( 'Category' );
    lab.position( 10, 100 );
    lab.size( 125, 15 );

    tile_sel = createSelect();
    tile_sel.position( 10, 120 );
    tile_sel.size( 125, 25 );
    for( let name of tile_names ) {
        tile_sel.option( name );
    }
    tile_sel.value( 'Delta' );

    colscheme_sel = createSelect();
    
    let save_button = createButton( "Save PNG" );
    save_button.position( 10, 200 );
    save_button.size( 125, 25 );
    save_button.mousePressed( function () {
        uibox = false;
        draw();
        save( "output.png" );
        uibox = true;
        draw();
    } );

    let svg_button = createButton( "Save SVG" );
    svg_button.position( 10, 230 );
    svg_button.size( 125, 25 );
    svg_button.mousePressed( function () {
        const stream = [];
        stream.push( `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` );
        stream.push( `<g transform="translate(${width/2},${height/2})">` );

        if (sys[tile_sel.value()] instanceof Meta) {
            sys[tile_sel.value()].streamSVG( to_screen, stream );
        } else if (sys[tile_sel.value()] instanceof Shape) {
            sys[tile_sel.value()].streamSVG(to_screen, stream);
        }

        stream.push( '</g>' );
        stream.push( '</svg>' );

        saveStrings( stream, 'output', 'svg' );
    } );
    
    globalTileCounter = 1;
    if (sys[tile_sel.value()] instanceof Meta) {
        sys[tile_sel.value()].assignSpiralNumbers();
    } else if (sys[tile_sel.value()] instanceof Shape) {
        sys[tile_sel.value()].number = globalTileCounter++;
    }
}

function draw(){
    background( 245, 245, 245);

    push();
    translate( width/2, height/2 );
    applyMatrix( 
        to_screen[0], to_screen[3], 
        to_screen[1], to_screen[4], 
        to_screen[2], to_screen[5] );

    if (sys[tile_sel.value()] instanceof Meta) {
        sys[tile_sel.value()].draw( ident );
    } else if (sys[tile_sel.value()] instanceof Shape) {
        sys[tile_sel.value()].draw(ident);
    }

    pop();

    if( uibox ) {
        stroke( 0 );
        strokeWeight( 0.5 );
        fill( 255, 220 );
        rect( 5, 5, 135, 285 );
    }
    noLoop();
}

function mousePressed() {
    dragging = true; 
    scale_centre = transPt( inv( to_screen ), pt( width/2, height/2 ) );
    scale_start = pt( mouseX, mouseY );
    scale_ts = [...to_screen];
    loop();
}

function mouseWheel(event) {
    const zoomFactor = 1.02; 
    const zoom = event.delta > 0 ? 1 / zoomFactor : zoomFactor; 
    to_screen = mul([zoom, 0, 0, 0, zoom, 0], to_screen);
    loop();
}

function mouseDragged() {
    if (dragging) {
        const dx = mouseX - pmouseX; 
        const dy = mouseY - pmouseY; 
        to_screen = mul(ttrans(dx, dy), to_screen); 
        loop();
        return false;
    }
}

function mouseReleased(){
    dragging = false;
    loop();
}
