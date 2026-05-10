import { Text, View } from "react-native";
import { apiVersion, createApiPath } from "@commerce/api/client";

export default function MobileHome() {
  return (
    <View style={{ flex: 1, gap: 18, padding: 24, paddingTop: 72, backgroundColor: "#f4f2ed" }}>
      <View>
        <Text style={{ color: "#235b4a", fontSize: 12, fontWeight: "800", textTransform: "uppercase" }}>
          Commerce mobile
        </Text>
        <Text style={{ marginTop: 12, color: "#16201c", fontSize: 32, fontWeight: "700" }}>
          API contract {apiVersion}
        </Text>
        <Text style={{ marginTop: 10, color: "#68736d", fontSize: 16, lineHeight: 24 }}>
          상품 목록, 로그인 세션, 푸시 수신을 같은 API 경계로 연결하기 위한 Expo 준비 화면입니다.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <MobileCard title="Products" body={`${createApiPath("/products")}에서 웹과 같은 상품 요약을 조회합니다.`} />
        <MobileCard title="Login" body="앱 심사 전 실제 인증 provider를 연결할 세션 경계입니다." />
        <MobileCard title="Push" body="마케팅 동의와 push consent를 분리해 알림 패키지 규칙을 재사용합니다." />
      </View>
    </View>
  );
}

function MobileCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: "#d8d1c7", borderRadius: 8, padding: 16, backgroundColor: "#fffefa" }}>
      <Text style={{ color: "#16201c", fontSize: 18, fontWeight: "800" }}>{title}</Text>
      <Text style={{ marginTop: 6, color: "#68736d", fontSize: 14, lineHeight: 20 }}>{body}</Text>
    </View>
  );
}
