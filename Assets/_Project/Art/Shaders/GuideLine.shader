// The route on the road (legacy guideLine.frag.glsl): a translucent cyan tape with discrete chevrons every 10 m
// travelling forward, fading near the car (so it does not cut through the bonnet) and towards the end of the window.
// uv.x = across the tape (0…1), uv.y = arc length along the route (m).
Shader "JapanMap/GuideLine"
{
    Properties
    {
        _Color ("Colour", Color) = (0.28, 0.82, 0.96, 1)
        _Arc ("Car arc (m)", Float) = 0
        _Reveal ("Shown ahead (m)", Float) = 240
        _Opacity ("Opacity", Range(0, 1)) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-10" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "Guide"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            Offset -2, -4
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                float _Arc;
                float _Reveal;
                half _Opacity;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.uv = v.uv;
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float ahead = i.uv.y - _Arc;
                float across = abs(i.uv.x - 0.5) * 2.0;
                float tape = 1.0 - smoothstep(0.78, 0.98, across);
                // 10 m slots, the arrow fills the front part, the rest is a gap (like road markings).
                float slot = frac((i.uv.y - _Time.y * 5.2) / 10.0);
                float u = saturate((slot - 0.06) / 0.40);
                float inSlot = smoothstep(0.06, 0.10, slot) * smoothstep(0.50, 0.44, slot);
                float outer = lerp(0.82, 0.04, u);
                float chev = 1.0 - smoothstep(outer, outer + 0.06, across);
                float notch = 1.0 - smoothstep(0.16, 0.28, u);
                float hollow = 1.0 - smoothstep(0.18, 0.32, across);
                chev *= 1.0 - notch * hollow;
                chev *= inSlot * smoothstep(4.0, 12.0, ahead);
                float fill = lerp(0.32, 1.0, chev);
                float nearFade = smoothstep(4.0, 12.0, ahead);
                float farFade = 1.0 - smoothstep(_Reveal - 60.0, _Reveal, ahead);
                float a = tape * fill * nearFade * farFade * _Opacity * 0.82;
                clip(a - 0.01);
                return half4(_Color.rgb * lerp(0.8, 1.25, chev), a);
            }
            ENDHLSL
        }
    }
}
