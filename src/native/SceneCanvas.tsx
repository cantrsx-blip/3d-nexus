import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export type SceneCanvasHandle = {
  loadGltb: (url: string) => void;
  loadGlbB64: (b64: string) => void;
  preset: (name: string) => void;
  snapshot: () => void;
  rotate: (x: number, y: number) => void;
};

type Props = {
  onError: (message: string) => void;
  onSnapshot: (dataUri: string) => void;
  onReady?: () => void;
};

const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#c{margin:0;width:100%;height:100%;overflow:hidden;background:#0a0a0b;touch-action:none}canvas{display:block}</style></head>
<body><div id="c"></div>
<script src="https://unpkg.com/three@0.167.1/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.167.1/examples/js/loaders/GLTFLoader.js"></script>
<script>
(function(){
  function send(v){ window.ReactNativeWebView.postMessage(JSON.stringify(v)); }
  try {
    var host=document.getElementById('c'), scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,100); camera.position.z=3;
    var renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setSize(innerWidth,innerHeight); renderer.setClearColor(0x0a0a0b,1); host.appendChild(renderer.domElement);
    var pivot=new THREE.Group(); scene.add(pivot);
    var placeholder=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,2),new THREE.MeshStandardMaterial({color:0xd7dbe0,metalness:.35,roughness:.45}));
    pivot.add(placeholder);
    var lights=new THREE.Group(); scene.add(lights);
    function preset(name){ lights.clear(); scene.background=null; var a=new THREE.AmbientLight(0xffffff,name==='Karanlık'?.3:1.15); lights.add(a); var d=new THREE.DirectionalLight(name==='Portre'?0xffd7b0:0xffffff,name==='Karanlık'?1.8:2.5); d.position.set(3,4,5); lights.add(d); renderer.setClearColor(name==='Beyaz stüdyo'?0xe8eaed:name==='Dış mekan'?0x8b9ba8:name==='Karanlık'?0x050608:0x0a0a0b,1); }
    preset('Ürün');
    function fit(obj){ var box=new THREE.Box3().setFromObject(obj), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3()), m=Math.max(size.x,size.y,size.z,.001), s=2/m; obj.scale.setScalar(s); obj.position.set(-center.x*s,-center.y*s,-center.z*s); }
    function setModel(obj){ while(pivot.children.length) pivot.remove(pivot.children[0]); fit(obj); pivot.add(obj); }
    function loadBuffer(buf){ new THREE.GLTFLoader().parse(buf,'',function(g){setModel(g.scene)},function(){send({type:'error',message:'3D model yüklenemedi'})}); }
    function command(m){
      try {
        if(m.type==='loadGltb') new THREE.GLTFLoader().load(m.url,function(g){setModel(g.scene)},undefined,function(){send({type:'error',message:'3D model yüklenemedi'})});
        else if(m.type==='loadGlbB64'){ var raw=atob(m.b64), u=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i); loadBuffer(u.buffer); }
        else if(m.type==='preset') preset(m.name);
        else if(m.type==='snapshot') send({type:'snapshot',dataUri:renderer.domElement.toDataURL('image/png')});
        else if(m.type==='rotate'){pivot.rotation.x=m.x||0;pivot.rotation.y=m.y||0;}
      } catch(e){ send({type:'error',message:'3D sahne açılamadı'}); }
    }
    document.addEventListener('message',function(e){try{command(JSON.parse(e.data))}catch(_){}});
    window.addEventListener('message',function(e){try{command(JSON.parse(e.data))}catch(_){}});
    var lastX=0,lastY=0,pinch=0;
    renderer.domElement.addEventListener('pointerdown',function(e){lastX=e.clientX;lastY=e.clientY;});
    renderer.domElement.addEventListener('pointermove',function(e){if(e.buttons){pivot.rotation.y+=(e.clientX-lastX)*.01;pivot.rotation.x+=(e.clientY-lastY)*.01;lastX=e.clientX;lastY=e.clientY;}});
    renderer.domElement.addEventListener('touchmove',function(e){if(e.touches.length===2){var dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY,d=Math.hypot(dx,dy);if(pinch)camera.position.z=Math.max(1.2,Math.min(12,camera.position.z+(pinch-d)*.01));pinch=d;}},{passive:true});
    renderer.domElement.addEventListener('touchend',function(){pinch=0});
    addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
    (function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)})();
    send({type:'ready'});
  } catch(e){ send({type:'error',message:'3D sahne açılamadı'}); }
})();
</script></body></html>`;

const SceneCanvas = forwardRef<SceneCanvasHandle, Props>(({ onError, onSnapshot, onReady }, ref) => {
  const webRef = useRef<WebView>(null);
  const post = (message: object) => webRef.current?.postMessage(JSON.stringify(message));
  useImperativeHandle(ref, () => ({
    loadGltb: (url) => post({ type: "loadGltb", url }),
    loadGlbB64: (b64) => post({ type: "loadGlbB64", b64 }),
    preset: (name) => post({ type: "preset", name }),
    snapshot: () => post({ type: "snapshot" }),
    rotate: (x, y) => post({ type: "rotate", x, y }),
  }));
  return (
    <WebView
      ref={webRef}
      style={styles.web}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={["*"]}
      onMessage={(event) => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === "ready") onReady?.();
          else if (message.type === "snapshot" && message.dataUri) onSnapshot(message.dataUri);
          else if (message.type === "error") onError(message.message || "3D sahne açılamadı");
        } catch {
          onError("3D sahne açılamadı");
        }
      }}
      onError={() => onError("3D sahne açılamadı")}
    />
  );
});
export default SceneCanvas;
const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: "#0a0a0b" } });
