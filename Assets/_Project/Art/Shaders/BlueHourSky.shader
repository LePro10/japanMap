// The blue-hour sky (LookProfile → LookSetup): zenith-to-horizon gradient, a warm glow and disc around the low sun,
// soft drifting clouds lit from the sun side, and exactly the fog colour below the horizon — the procedural skybox
// mixed its own ground colour there and drew a dark band behind the sea (2026-10-13). The clouds also give the
// puddles and reflection probes something to mirror (the prototype had an HDRI with clouds).
Shader "JapanMap/Blue Hour Sky"
{
    Properties
    {
        _ZenithColor("Zenith", Color) = (0.10, 0.18, 0.38, 1)
        _HorizonColor("Horizon", Color) = (0.55, 0.62, 0.74, 1)
        _GroundColor("Below the horizon (= fog)", Color) = (0.56, 0.62, 0.71, 1)
        _HorizonSharpness("Horizon band sharpness", Range(0.5, 8)) = 2.6
        _SunDirection("Towards the sun (world)", Vector) = (0.8, 0.12, -0.58, 0)
        _SunColor("Sun colour", Color) = (1, 0.7, 0.48, 1)
        _SunSize("Sun disc size", Range(0.0005, 0.05)) = 0.006
        _SunGlow("Sun glow strength", Range(0, 4)) = 1.1
        _SunGlowWidth("Sun glow width", Range(1, 64)) = 7
        _CloudColor("Cloud colour (shadow side)", Color) = (0.30, 0.35, 0.46, 1)
        _CloudLit("Cloud colour (sun side)", Color) = (1.0, 0.72, 0.58, 1)
        _CloudCover("Cloud cover", Range(0, 1)) = 0.48
        _CloudSoftness("Cloud softness", Range(0.01, 0.5)) = 0.2
        _CloudScale("Cloud scale", Float) = 1.6
        _CloudSpeed("Cloud drift", Float) = 0.004
        _Exposure("Exposure", Range(0, 4)) = 1
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite Off

        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 2.0
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
            half4 _ZenithColor, _HorizonColor, _GroundColor, _SunColor, _CloudColor, _CloudLit;
            float4 _SunDirection;
            half _HorizonSharpness, _SunSize, _SunGlow, _SunGlowWidth, _CloudCover, _CloudSoftness, _Exposure;
            float _CloudScale, _CloudSpeed;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };

            Varyings Vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.dir = v.positionOS.xyz;
                return o;
            }

            float Hash(float2 p)
            {
                p = frac(p * float2(0.1031, 0.1030));
                p += dot(p, p.yx + 33.33);
                return frac((p.x + p.y) * p.x);
            }

            float Noise(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(Hash(i), Hash(i + float2(1, 0)), u.x), lerp(Hash(i + float2(0, 1)), Hash(i + float2(1, 1)), u.x), u.y);
            }

            float Fbm(float2 p)
            {
                float s = 0, a = 0.55;
                for (int k = 0; k < 4; k++) { s += Noise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; }
                return s;
            }

            half4 Frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float3 sun = normalize(_SunDirection.xyz);
                float up = d.y;

                // Gradient: horizon band widening into the zenith blue.
                float t = pow(saturate(up), 1.0 / _HorizonSharpness);
                half3 col = lerp(_HorizonColor.rgb, _ZenithColor.rgb, t);

                // Sun: wide warm glow along the horizon plus a small disc.
                float cosSun = dot(d, sun);
                half glow = pow(saturate(cosSun * 0.5 + 0.5), _SunGlowWidth) * _SunGlow;
                col += _SunColor.rgb * glow * (1.0 - t * 0.6);
                col += _SunColor.rgb * 12.0 * smoothstep(1.0 - _SunSize, 1.0 - _SunSize * 0.6, cosSun);

                // Clouds on a plane above the camera; thin out towards the horizon (haze) and the zenith fades last.
                if (up > 0.0)
                {
                    float2 uv = d.xz / (up + 0.12) * _CloudScale + _Time.y * _CloudSpeed * float2(1.0, 0.35);
                    float n = Fbm(uv);
                    half cover = smoothstep(1.0 - _CloudCover - _CloudSoftness, 1.0 - _CloudCover + _CloudSoftness, n);
                    cover *= smoothstep(0.0, 0.18, up);
                    half lit = saturate(cosSun * 0.5 + 0.5);
                    half3 cloud = lerp(_CloudColor.rgb, _CloudLit.rgb, pow(lit, 3.0) * 0.9);
                    col = lerp(col, cloud, cover * 0.85);
                }

                // Below the horizon: the fog colour, blended over a thin band so there is no seam.
                col = lerp(_GroundColor.rgb, col, smoothstep(-0.02, 0.01, up));
                return half4(col * _Exposure, 1);
            }
            ENDHLSL
        }
    }
    Fallback Off
}
