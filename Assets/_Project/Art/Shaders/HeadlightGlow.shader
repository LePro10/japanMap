// Car lamp light without real lights (Headlights.cs, D52): the beam pattern on the road, the faint cone in front of the
// lamps and small glow sprites (meshes carry white vertex colours; the beam grid fades with them). Additive and unlit, one pass. _Edge softens a cone's silhouette (the side seen edge-on
// fades), _Ground fades a flat quad seen at grazing angles (as LightPool.shader: no glowing line on the horizon).
Shader "JapanMap/Headlight Glow"
{
    Properties
    {
        _MainTex("Pattern", 2D) = "white" {}
        _Color("Colour (HDR)", Color) = (1, 1, 1, 1)
        _Edge("Edge softness (0 = off)", Range(0, 8)) = 0
        _Ground("Grazing fade (0/1)", Float) = 0
        [Enum(UnityEngine.Rendering.CullMode)] _Cull("Cull", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-5" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Blend One One
        ZWrite Off
        Cull [_Cull]

        Pass
        {
            Name "HeadlightGlow"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 2.0
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
            float4 _MainTex_ST;
            half4 _Color;
            half _Edge;
            half _Ground;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; half4 color : COLOR; };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; half fog : TEXCOORD1; half fade : TEXCOORD2; };

            Varyings Vert(Attributes v)
            {
                Varyings o;
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(ws);
                half3 view = (half3)normalize(GetCameraPositionWS() - ws);
                half3 n = (half3)TransformObjectToWorldNormal(v.normalOS);
                half edge = _Edge > 0 ? pow(saturate(abs(dot(n, view))), _Edge) : 1;
                // Seen from the driver's seat the beam lies at 5–10° to the view: fade only below that (LightPool fades from 20°).
                half ground = _Ground > 0 ? saturate((abs(dot(n, view)) - 0.015) / 0.08) : 1;
                o.fade = edge * ground * v.color.r; // vertex colour: the beam grid fades where it found no ground
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 Frag(Varyings i) : SV_Target
            {
                half3 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).rgb * _Color.rgb * i.fade;
                // Additive: fog towards black, not towards the fog colour.
                c = MixFogColor(c, half3(0, 0, 0), i.fog);
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
}
