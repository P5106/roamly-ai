import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const envPath=path.join(__dirname,'.env');
// Always load .env from the project folder (not the shell's cwd) and let it win over empty/stale shell variables.
dotenv.config({path:envPath,override:true});
const clean=v=>String(v||'').trim().replace(/^["']+|["']+$/g,'').trim();
const getKey=()=>clean(process.env.OPENROUTER_API_KEY)||clean(process.env.VITE_OPENROUTER_API_KEY);
const keyMissing=k=>!k||/your_openrouter_api_key/i.test(k);
const MISSING_MSG='OpenRouter API key is missing. Create a file named exactly ".env" (not .env.example) in the project folder containing OPENROUTER_API_KEY=your_key, then restart npm run dev.';
const app=express(); app.use(cors()); app.use(express.json({limit:'7mb'}));
app.get('/api/health',(_,res)=>res.json({ok:true,keyConfigured:!keyMissing(getKey()),envFileFound:fs.existsSync(envPath)}));

app.post('/api/chat',async(req,res)=>{
 const apiKey=getKey();
 if(keyMissing(apiKey))return res.status(503).json({error:MISSING_MSG});
 const messages=Array.isArray(req.body?.messages)?req.body.messages:[];
 if(!messages.length)return res.status(400).json({error:'Send a travel question to start the chat.'});
 const model=clean(req.body?.model||process.env.VITE_OPENROUTER_MODEL)||'openai/gpt-4o-mini';
 try{
  const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':'http://localhost:5173','X-Title':'Roamly Travel'},body:JSON.stringify({model,messages,temperature:0.6}),signal:AbortSignal.timeout(45000)});
  const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok){const providerMessage=data?.error?.message||`OpenRouter returned HTTP ${upstream.status}.`;return res.status([401,402,404].includes(upstream.status)?upstream.status:502).json({error:upstream.status===401?'OpenRouter rejected the API key. Check that the key is correct and active.':upstream.status===402?'OpenRouter reports insufficient credits or no available balance. Check your account and selected model.':upstream.status===404?'The selected model is unavailable. Check VITE_OPENROUTER_MODEL in .env.':providerMessage});}
  const answer=data?.choices?.[0]?.message?.content;
  if(!answer)return res.status(502).json({error:'The AI provider returned no answer. Try again or choose another model in .env.'});
  res.json({answer});
 }catch(err){res.status(504).json({error:err.name==='TimeoutError'?'The AI request timed out. Please try again.':'Could not contact OpenRouter. Check your internet connection and try again.'});}
});


app.post('/api/identify',async(req,res)=>{
 const apiKey=getKey();
 if(keyMissing(apiKey))return res.status(503).json({error:MISSING_MSG});
 const image=String(req.body?.image||''); const fileName=String(req.body?.fileName||'uploaded image');
 if(!image.startsWith('data:image/')||!/^data:image\/(jpeg|png|webp);base64,/.test(image))return res.status(400).json({error:'Upload a JPG, PNG or WebP image.'});
 if(image.length>6_800_000)return res.status(413).json({error:'Image is too large. Choose a photo under 5 MB.'});
 try{
  const model=clean(process.env.VITE_OPENROUTER_MODEL)||'openai/gpt-4o-mini';
  const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':'http://localhost:5173','X-Title':'Roamly Travel Companion Camera'},body:JSON.stringify({model,temperature:0.3,max_tokens:900,messages:[{role:'user',content:[{type:'text',text:`You are Roamly's visual travel companion. Analyse the uploaded travel image (${fileName}); current trip destination if known: ${String(req.body?.destination||'unknown')}. First describe only what is visibly present. If it appears to show a landmark, give the most likely identity and confidence (high/medium/low), explain historical/cultural significance only when reasonably supported, and list clues that support the guess. If uncertain, offer up to 3 plausible possibilities and say how the user can verify. If a menu or sign is visible, transcribe/translate only legible text and note uncertainty. Never invent precise location, opening hours, prices or safety status. If it is not a travel-related image, say so politely.`},{type:'image_url',image_url:{url:image}}]}]}),signal:AbortSignal.timeout(60000)});
  const data=await upstream.json().catch(()=>({})); if(!upstream.ok){const status=upstream.status;return res.status(status===401?401:status===402?402:502).json({error:status===401?'OpenRouter rejected the API key. Check your key.':status===402?'OpenRouter reports insufficient credits or no available balance.':'Image analysis provider error: '+(data?.error?.message||`HTTP ${status}`)});}
  const answer=data?.choices?.[0]?.message?.content; if(!answer)return res.status(502).json({error:'The AI provider returned no image analysis. Try another photo.'});res.json({answer});
 }catch(err){res.status(504).json({error:err.name==='TimeoutError'?'Image analysis timed out. Try a smaller image.':'Could not contact the AI provider. Check internet access and try again.'});}
});

app.get('/api/hotels',async(req,res)=>{
 const destination=String(req.query.destination||'').trim();
 if(!destination)return res.status(400).json({error:'Destination is required.'});
 if(!process.env.SERPAPI_API_KEY)return res.status(503).json({live:false,message:'Live hotel data is not configured. Use a booking partner to see current prices and availability.'});
 try{
  const u=new URL('https://serpapi.com/search.json'); u.searchParams.set('engine','google_hotels');u.searchParams.set('q',destination);
  u.searchParams.set('check_in_date',req.query.checkin||new Date(Date.now()+86400000).toISOString().slice(0,10));
  u.searchParams.set('check_out_date',req.query.checkout||new Date(Date.now()+3*86400000).toISOString().slice(0,10));
  u.searchParams.set('adults',String(req.query.adults||2));u.searchParams.set('currency','INR');u.searchParams.set('gl','in');u.searchParams.set('hl','en');u.searchParams.set('api_key',process.env.SERPAPI_API_KEY);
  const r=await fetch(u);if(!r.ok)throw Error('Hotel provider unavailable');const d=await r.json();
  res.json({live:true,hotels:(d.properties||[]).slice(0,12).map(h=>({name:h.name||'Hotel',image:h.images?.[0]?.thumbnail||h.thumbnail||'',rating:h.overall_rating||null,reviews:h.reviews||null,price:h.rate_per_night?.lowest||h.rate_per_night?.extracted_lowest||'',totalPrice:h.total_rate?.lowest||'',link:h.link||h.serpapi_property_details_link||'',location:h.neighborhood||h.description||''}))});
 }catch(e){res.status(502).json({error:'Hotel results are unavailable right now. Try a booking partner link.'});}
});
app.listen(Number(process.env.PORT||5000),'0.0.0.0',()=>{console.log('Roamly API running on port '+(process.env.PORT||5000));console.log(keyMissing(getKey())?'⚠ OpenRouter key NOT found. Expected .env at: '+envPath:'✓ OpenRouter key loaded from .env')});