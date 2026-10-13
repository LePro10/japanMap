#ifndef JM_WET_SURFACE_COMMON_INCLUDED
#define JM_WET_SURFACE_COMMON_INCLUDED

// After rain (legacy road_puddles.glsl): a thin wet film everywhere, and puddles from world-space value noise at two
// scales where the surface turns into a mirror — roughness near zero, the normal map flattened (a rippled normal
// under water breaks the reflection into glitter), the albedo darker so the reflection carries the colour.
// Roads also get their paint and shoulder from the road data channel (mesh UV3, RoadImporter):
//   x = lateral distance from the centre line (m, signed), y = distance along the road (m),
//   z = half carriageway width (m, 0 = not a road), w = marking style (0 none, 1 edges + dashed centre, 2 edges).

float JmHash(float2 p)
{
    p = frac(p * float2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return frac((p.x + p.y) * p.x);
}

float JmValueNoise(float2 p)
{
    float2 i = floor(p);
    float2 f = frac(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    float a = JmHash(i);
    float b = JmHash(i + float2(1, 0));
    float c = JmHash(i + float2(0, 1));
    float d = JmHash(i + float2(1, 1));
    return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
}

// 1 on a line of width w centred at distance 0 (screen-space antialiased), 0 elsewhere.
half JmLine(float distance, half width)
{
    float aa = max(fwidth(distance), 1e-4);
    return 1.0h - (half)smoothstep(width * 0.5 - aa, width * 0.5 + aa, abs(distance));
}

// Returns the puddle share (0…1) for the mirror.
half ApplyWetSurface(inout SurfaceData s, float3 positionWS, float4 road)
{
    float2 xz = positionWS.xz;
    bool isRoad = road.z > 0.01;
    float edge = isRoad ? saturate(abs(road.x) / road.z) : 0.0;   // 0 centre … 1 carriageway edge

    // Paint, under the water (puddles lie on top of it).
    half paint = 0;
    if (isRoad && road.w > 0.5)
    {
        float edgeLine = abs(road.x) - (road.z - _MarkInset);
        paint = JmLine(edgeLine, _MarkWidth);
        if (road.w < 1.5)
        {
            float period = _DashLength + _DashGap;
            float along = frac(road.y / period) * period;
            float aa = max(fwidth(road.y), 1e-4);
            half dash = 1.0h - (half)smoothstep(_DashLength - aa, _DashLength + aa, along);
            paint = max(paint, JmLine(road.x, _MarkWidth) * dash);
        }
        // Worn paint: patchy at a 0.6 m scale, a little thinner on the wheel tracks.
        half wear = (half)smoothstep(0.15, 0.75, JmValueNoise(xz / 0.6) * 0.6 + JmValueNoise(xz / 4.0) * 0.4);
        paint *= lerp(1.0h, wear, _MarkWear);
        s.albedo = lerp(s.albedo, _MarkColor.rgb, paint);
        s.smoothness = lerp(s.smoothness, s.smoothness * 0.7h, paint);
    }

    // Shoulder: gravel and grime collect beyond the carriageway edge (soft, noisy border, no hard seam).
    if (isRoad)
    {
        float border = abs(road.x) - road.z + (JmValueNoise(xz / 0.8) - 0.5) * 0.35;
        half shoulder = (half)smoothstep(-0.05, 0.25, border);
        s.albedo = lerp(s.albedo, s.albedo * _ShoulderColor.rgb, shoulder);
        s.smoothness = lerp(s.smoothness, _ShoulderSmoothness, shoulder);
    }

    // Wet film everywhere.
    s.albedo *= _WetDarken;

    // Puddles: large patches with small ragged edges; water gathers towards the edges (crown of the road).
    float n = JmValueNoise(xz / _PuddleScale) * 0.7 + JmValueNoise(xz / _PuddleDetail) * 0.3;
    n += _PuddleEdgeBias * edge * edge;
    half puddle = (half)smoothstep(1.0 - _PuddleCover - _PuddleSoftness, 1.0 - _PuddleCover + _PuddleSoftness, n);
    s.smoothness = lerp(s.smoothness, _PuddleSmoothness, puddle);
    s.albedo *= lerp(1.0h, _PuddleDarken, puddle);
    s.normalTS = normalize(lerp(s.normalTS, half3(0, 0, 1), puddle * _PuddleFlatten));
    s.occlusion = lerp(s.occlusion, 1.0h, puddle * 0.5h);
    return puddle;
}

// The city mirror (PlanarReflection.cs): x = plane height, y = strength, z = ripple distortion, w = 1 when rendered.
TEXTURE2D(_JM_PlanarTex);
SAMPLER(sampler_JM_PlanarTex);
float4 _JM_Planar;

// Swaps the sky reflection for the mirror image in the puddles that lie on the mirror plane (legacy: the planar
// texture replaced the environment radiance, so Fresnel and roughness still apply). Returns what to add.
half3 JmPlanarReflection(SurfaceData s, InputData d, half puddle)
{
    if (_JM_Planar.w < 0.5) return half3(0, 0, 0);
    half onPlane = (half)saturate(1.0 - abs(d.positionWS.y - _JM_Planar.x) * 2.0);
    half w = puddle * onPlane * (half)saturate(d.normalWS.y * 4.0 - 3.0);
    if (w <= 0.001h) return half3(0, 0, 0);
    BRDFData brdf;
    InitializeBRDFData(s, brdf);
    half3 r = reflect(-d.viewDirectionWS, d.normalWS);
    half fresnel = Pow4(1.0h - saturate(dot(d.normalWS, d.viewDirectionWS)));
    half3 env = GlossyEnvironmentReflection(r, d.positionWS, brdf.perceptualRoughness, s.occlusion, d.normalizedScreenSpaceUV);
    float2 uv = d.normalizedScreenSpaceUV;
    uv.x = 1.0 - uv.x; // the mirror camera is a proper rotation: its image is flipped left to right
    uv += d.normalWS.xz * _JM_Planar.z;
    half3 mirror = SAMPLE_TEXTURE2D(_JM_PlanarTex, sampler_JM_PlanarTex, uv).rgb;
    return (mirror - env) * EnvironmentBRDFSpecular(brdf, fresnel) * (w * (half)_JM_Planar.y);
}

#endif
