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
	'Gamma': [250, 250, 250],  // Almost White
	'Gamma1': [230, 230, 230], // Very Light Gray
	'Gamma2': [210, 210, 210], // Light Gray
	'Delta': [190, 200, 210],  // Subtle Grayish Blue
	'Theta': [170, 190, 200],  // Soft Blue-Gray
	'Lambda': [150, 170, 190], // Medium Blue-Gray
	'Xi': [130, 150, 180],     // Desaturated Blue
	'Pi': [110, 130, 170],     // Muted Medium Blue
	'Sigma': [90, 110, 150],   // Slightly Darker Blue
	'Phi': [70, 90, 130],      // Dark Blue
	'Psi': [50, 70, 110]       // Deep Blue
};

function pt( x, y ){
	return { x : x, y : y };
}

// Affine matrix inverse
function inv( T ) {
	const det = T[0]*T[4] - T[1]*T[3];
	return [T[4]/det, -T[1]/det, (T[1]*T[5]-T[2]*T[4])/det,
		-T[3]/det, T[0]/det, (T[2]*T[3]-T[0]*T[5])/det];
};

// Affine matrix multiply
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

// Rotation matrix
function trot( ang ){
	const c = cos( ang );
	const s = sin( ang );
	return [c, -s, 0, s, c, 0];
}

// Translation matrix
function ttrans( tx, ty )
{
	return [1, 0, tx, 0, 1, ty];
}

function transTo( p, q ){
	return ttrans( q.x - p.x, q.y - p.y );
}

function rotAbout( p, ang ){
	return mul( ttrans( p.x, p.y ), 
		mul( trot( ang ), ttrans( -p.x, -p.y ) ) );
}

// Matrix * point
function transPt( M, P ){
	return pt(M[0]*P.x + M[1]*P.y + M[2], M[3]*P.x + M[4]*P.y + M[5]);
}

// Match unit interval to line segment p->q
function matchSeg( p, q ){
	return [q.x-p.x, p.y-q.y, p.x,  q.y-p.y, q.x-p.x, p.y];
};

// Match line segment p1->q1 to line segment p2->q2
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
		strokeWeight( w ) ; // / lw_scale );
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


let globalTileCounter = 1; // Global counter for tile numbering

class Shape {
    constructor(pts, quad, label) {
        this.pts = pts; // Polygon points
        this.quad = quad; // Key points
        this.label = label; // Tile type
        this.number = globalTileCounter; // Assign a unique number
        this.isBlack = false; // Track if the tile is black
    }

    draw(S) {
        const color = this.isBlack ? [0, 0, 0] : colmap[this.label];
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
        fill(0);
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
        const col = colmap[this.label];
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

    addChild(g, T) {
        if (g instanceof Shape) {
            const childGeom = new Shape(g.pts, g.quad, g.label); // Create a unique copy
            childGeom.number = globalTileCounter++; // Assign a unique number
            this.geoms.push({ geom: childGeom, xform: T });
        } else if (g instanceof Meta) {
            const childGeom = new Meta();
            g.geoms.forEach((child) => {
                childGeom.addChild(child.geom, child.xform); // Recursively copy
            });
            this.geoms.push({ geom: childGeom, xform: T });
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
        ret[lab] = new Shape(spectre, spectre_keys, lab);
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
        Gamma: ['Pi', 'Delta', 'null', 'Theta', 'Sigma', 'Xi', 'Phi', 'Gamma'],
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

    for (const [lab, subs] of Object.entries(super_rules)) {
        const sup = new Meta();
        for (let idx = 0; idx < 8; ++idx) {
            if (subs[idx] === 'null') {
                continue; // Skip null tiles
            }
            const child = sys[subs[idx]];
            sup.addChild(child, Ts[idx]); // Add valid child
        }
        sup.quad = super_quad;

        ret[lab] = sup;
    }

    return ret;
}
function buildHexBase(){
	const hr3 = 0.8660254037844386;

	const hex = [
		pt(0, 0),
		pt(1.0, 0.0),
		pt(1.5, hr3),
		pt(1, 2*hr3),
		pt(0, 2*hr3),
		pt(-0.5, hr3) 
	];

	const hex_keys = [ hex[1], hex[2], hex[3], hex[5] ];

	const ret = {};

	for( lab of ['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 
				 'Pi', 'Sigma', 'Phi', 'Psi'] ) {
		ret[lab] = new Shape( hex, hex_keys, lab );
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
			sys = buildSpectreBase(
			 );
		}
		to_screen = [20, 0, 0, 0, -20, 0];
		lw_scale = 1;
		loop();
	} );


	reset_but = createButton("Reset");
	reset_but.position(10, 260);
	reset_but.size(125, 25);
	reset_but.mousePressed(function () {
		// Keep the currently selected shape and tile
		const currentShape = shape_sel.value(); // Save the selected shape
		const currentTile = tile_sel.value(); // Save the selected tile
	
		// Rebuild the system based on the current shape
		if (currentShape === 'Hexagons') {
			sys = buildHexBase();
		} else {
			sys = buildSpectreBase(); // Default to Tile(1,1)
		}
	
		// Reset transformations
		to_screen = [20, 0, 0, 0, -20, 0];
		lw_scale = 0.2;
	
		// Reapply the selected tile
		tile_sel.value(currentTile);
	
		loop();
	});

	subst_button = createButton( "Build Supertiles" );
	subst_button.position( 10, 60 );
	subst_button.size( 125, 25 );
	subst_button.mousePressed( function() {
		sys = buildSupertiles( sys );	
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

		sys[tile_sel.value()].streamSVG( to_screen, stream );

        stream.push( '</g>' );
        stream.push( '</svg>' );

        saveStrings( stream, 'output', 'svg' );
    } );
}

function draw(){
	background( 255 );

	push();
	translate( width/2, height/2 );

	applyMatrix( 
		to_screen[0], to_screen[3], 
		to_screen[1], to_screen[4], 
		to_screen[2], to_screen[5] );

	const s = colscheme_sel.value();

	sys[tile_sel.value()].draw( ident );

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
    dragging = true; // Start dragging
	scale_centre = transPt( inv( to_screen ), pt( width/2, height/2 ) );
	scale_start = pt( mouseX, mouseY );
	scale_ts = [...to_screen];
	loop();
}

function mouseWheel(event) {
    // Set a consistent zoom factor for both in and out
    const zoomFactor = 1.02; // Uniform zoom speed
    const zoom = event.delta > 0 ? 1 / zoomFactor : zoomFactor; // Zoom in/out uniformly

    // Apply zoom directly to the transformation matrix
    to_screen = mul(
        [zoom, 0, 0, 0, zoom, 0], // Uniform scaling
        to_screen
    );

    loop();
}

function mouseDragged() {
    if (dragging) {
        const dx = mouseX - pmouseX; // Horizontal movement
        const dy = mouseY - pmouseY; // Vertical movement
        to_screen = mul(ttrans(dx, dy), to_screen); // Translate the view
        loop();
		return false;
    }
}

function mouseReleased(){
	dragging = false;
	loop();
}