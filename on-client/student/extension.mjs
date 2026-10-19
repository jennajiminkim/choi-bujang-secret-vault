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
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('div');
      const line = value => {
        const element = document.createElement('p');
        element.textContent = value;
        root.appendChild(element);
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      switch (mode) {
        case 'connected': break;
        case 'demo': line('예제 자료 (demo)'); break;
        case 'disconnected': line('연결 없음 (disconnected)'); break;
        default: line('연결 상태 확인 불가 (unknown)'); break;
      }
      // 요청 실패·대기 중에는 이전 data의 판정·이유·시각을 표시하지 않습니다.
      line(`업무 앱 ID: ${value(status === 'ok' ? data?.appId : appId)}`);
      if (status === 'idle') {
        line('업무 앱을 선택하고 접근을 요청하세요.');
      } else if (status === 'loading') {
        line('접근 판정 확인 중');
      } else if (status === 'error') {
        line(`접근 요청 실패: ${value(error?.message)}`);
        line('요청 실패는 접근 거부 판정이 아닙니다. 접근 허용 여부는 확인할 수 없습니다.');
      } else if (status === 'ok') {
        switch (data?.decision) {
          case 'allow':
            line('접근 허용 (allow)');
            line('정책상 접근 허용이며 실제 업무 앱 접속 성공을 보장하지 않습니다.');
            break;
          case 'deny': line('접근 거부 (deny)'); break;
          case 'challenge':
            line('추가 인증 또는 확인 필요 (challenge)');
            line('이 앱은 추가 인증이나 확인 절차를 대신 수행하지 않습니다.');
            break;
          default: line('판정 확인 불가 (unknown)'); break;
        }
        line(`판정 이유: ${value(data?.reason)}`);
        line(`판정 시각: ${value(data?.checkedAt)}`);
      } else {
        line('판정 확인 불가 (unknown)');
      }
      return root;
    },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
