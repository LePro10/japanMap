// The sea after rain (WaterImporter "Water_Sea"): it was a flat opaque mirror — no waves, no foam, a hard line at the
// rock (2026-10-13). Procedural swell from a few travelling sine waves (no textures, nothing to download), Fresnel
// reflection of the sky/probe, a sun glint, colour from deep to shallow, and foam where the water meets the shore
// (scene depth; on tiers without a depth texture there is no foam — _JM_DepthAvailable, set by PlanarReflection).
Shader "JapanMap/Sea"
{
    Properties
    {
        _DeepColor("Deep", Color) = (0.03, 0.09, 0.14, 1)
        _ShallowColor("Shallow", Color) = (0.08, 0.2, 0.24, 1)
        _FoamColor("Foam", Color) = (0.75, 0.82, 0.86, 1)
        _WaveScale("Wave length scale", Float) = 1
        _WaveHeight("Wave slope strength", Range(0, 1)) = 0.12
        _WaveSpeed("Wave speed", Float) = 1
        _Smoothness("Smoothness", Range(0, 1)) = 0.92
        _FoamWidth("Shore foam width (m)", Float) = 2.2
        _ShallowDepth("Shallow depth (m)", Float) = 6
        _Glint("Sun glint", Range(0, 8)) = 3
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-50" "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZWrite On
        Cull Back

        Pass
        {
            Name "Sea"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 2.0
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"

            CBUFFER_START(UnityPerMaterial)
            half4 _DeepColor, _ShallowColor, _FoamColor;
            float _WaveScale, _WaveSpeed, _FoamWidth, _ShallowDepth;
            half _WaveHeight, _Smoothness, _Glint;
            CBUFFER_END
            float _JM_DepthAvailable;

            struct Attributes { float4 positionOS : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float4 screen : TEXCOORD1;
                half fog : TEXCOORD2;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings Vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.positionWS);
                o.screen = ComputeScreenPos(o.positionCS);
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            // Slope (d height / dx, dz) of a few directional sine waves: long swell plus short chop.
            float2 Slope(float2 p, float t)
            {
                float2 s = 0;
                const float4 waves[4] = {
                    float4(0.8, 0.6, 0.045, 1.0),   // direction xy, wave number, weight
                    float4(-0.5, 0.86, 0.09, 0.6),
                    float4(0.2, -0.98, 0.21, 0.35),
                    float4(-0.9, -0.3, 0.47, 0.18) };
                [unroll] for (int i = 0; i < 4; i++)
                {
                    float k = waves[i].z / _WaveScale;
                    float phase = dot(waves[i].xy, p) * k + t * sqrt(9.81 * k);
                    s += waves[i].xy * cos(phase) * waves[i].w;
                }
                return s;
            }

            half4 Frag(Varyings i) : SV_Target
            {
                float t = _Time.y * _WaveSpeed;
                float2 slope = Slope(i.positionWS.xz, t) * _WaveHeight;
                half3 n = normalize(half3(-slope.x, 1.0, -slope.y));
                float3 v = normalize(GetCameraPositionWS() - i.positionWS);
                half nv = saturate(dot(n, v));
                half fresnel = 0.02 + 0.98 * pow(1.0 - nv, 5.0);

                // Shore: water depth from the scene depth behind this pixel.
                half shore = 0;
                half depthShare = 1;
                if (_JM_DepthAvailable > 0.5)
                {
                    float2 uv = i.screen.xy / i.screen.w;
                    float scene = LinearEyeDepth(SampleSceneDepth(uv), _ZBufferParams);
                    float water = LinearEyeDepth(i.positionCS.z, _ZBufferParams);
                    float d = max(0.0, scene - water);
                    depthShare = saturate(d / _ShallowDepth);
                    shore = saturate(1.0 - d / _FoamWidth);
                }
                half3 body = lerp(_ShallowColor.rgb, _DeepColor.rgb, depthShare);
                Light sun = GetMainLight();
                body *= (sun.color * saturate(sun.direction.y + 0.2) * 0.6 + SampleSH(n));

                half3 r = reflect(-v, n);
                r.y = abs(r.y); // a steep wave never mirrors the ground under the horizon (the fog-coloured lower sky)
                half3 env = GlossyEnvironmentReflection(r, i.positionWS, 1.0 - _Smoothness, 1.0);
                half3 h = normalize(sun.direction + v);
                half glint = pow(saturate(dot(n, h)), 600.0) * _Glint;
                half3 col = lerp(body, env, fresnel) + sun.color * glint;

                // Foam: broken bands that run up the shore with the swell.
                float bands = sin(shore * 9.0 - t * 1.7 + dot(i.positionWS.xz, float2(0.13, 0.07)));
                half foam = shore * shore * saturate(0.55 + 0.45 * bands);
                col = lerp(col, _FoamColor.rgb * (SampleSH(half3(0, 1, 0)) + sun.color * 0.4), foam);

                // Fog per pixel: the sea is one 16 km quad, its corners are all fog — interpolated, so was everything.
                col = MixFog(col, ComputeFogFactor(TransformWorldToHClip(i.positionWS).z));
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
}
