import AcademicsClassic from './AcademicsClassic.jsx';
import AcademicsTechnical from './AcademicsTechnical.jsx';

export default function Academics(props) {
  if (props.user?.uiStyle === 'technical') return <AcademicsTechnical {...props} />;
  return <AcademicsClassic {...props} />;
}
