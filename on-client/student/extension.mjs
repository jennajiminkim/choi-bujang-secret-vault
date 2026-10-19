// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 호출마다 새 요소를 반환합니다. 이전 입력이나 DOM을 보관하지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, value) => {
        const element = document.createElement(tag);
        element.textContent = value;
        parent.appendChild(element);
        return element;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      const deviceState = status => {
        switch (status) {
          case 'compliant': return '보안 기준 충족 (compliant)';
          case 'noncompliant': return '보안 기준 미충족 (noncompliant)';
          default: return '확인 불가 (unknown)';
        }
      };
      const sessionState = status => {
        switch (status) {
          case 'active': return '활성 (active)';
          case 'expired': return '만료 (expired)';
          case 'revoked': return '철회됨 (revoked)';
          default: return '확인 불가 (unknown)';
        }
      };
      const deviceLine = device =>
        `기기 이름: ${value(device?.label)} · 기기 ID: ${value(device?.id)} · 상태: ${deviceState(device?.status)}`;
      const sessionLine = session =>
        `세션 ID: ${value(session?.id)} · 상태: ${sessionState(session?.status)}`;
      const section = (title, input, renderData) => {
        const container = text(root, 'section', '');
        text(container, 'h3', title);
        switch (input?.mode) {
          case 'connected': break;
          case 'demo': text(container, 'p', '예제 자료 (demo)'); break;
          case 'disconnected': text(container, 'p', '연결 없음 (disconnected)'); break;
          default: text(container, 'p', '확인 불가 (unknown)'); break;
        }
        if (input?.status === 'loading') {
          text(container, 'p', '불러오는 중');
        } else if (input?.status === 'error') {
          text(container, 'p', `연결 실패 또는 확인 불가: ${value(input.error?.message)}`);
        } else if (input?.status === 'ok') {
          renderData(container, input.data);
        } else {
          text(container, 'p', '확인 불가');
        }
      };
      section('현재 계정·기기·세션', me, (container, data) => {
        text(container, 'p', `사용자 이름: ${value(data?.user?.label)}`);
        text(container, 'p', `사용자 ID: ${value(data?.user?.id)}`);
        text(container, 'p', deviceLine(data?.device));
        text(container, 'p', sessionLine(data?.session));
      });
      section('기기 목록', devices, (container, data) => {
        if (!Array.isArray(data)) {
          text(container, 'p', '확인 불가: 기기 목록 형식을 확인할 수 없습니다.');
        } else if (data.length === 0) {
          text(container, 'p', '표시할 기기가 없습니다.');
        } else {
          const list = text(container, 'ul', '');
          for (const device of data) text(list, 'li', deviceLine(device));
        }
      });
      section('세션 목록', sessions, (container, data) => {
        if (!Array.isArray(data)) {
          text(container, 'p', '확인 불가: 세션 목록 형식을 확인할 수 없습니다.');
        } else if (data.length === 0) {
          text(container, 'p', '표시할 세션이 없습니다.');
        } else {
          const list = text(container, 'ul', '');
          for (const session of data) text(list, 'li', sessionLine(session));
        }
      });
      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
