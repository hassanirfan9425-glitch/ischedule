import AcademicsClassic from './AcademicsClassic.jsx';
import AcademicsTechnical from './AcademicsTechnical.jsx';
import AcademicsOrbit from './AcademicsOrbit.jsx';

export default function Academics(props) {
  if (props.user?.uiStyle === 'technical') return <AcademicsTechnical {...props} />;
  if (props.user?.uiStyle === 'orbit') return <AcademicsOrbit {...props} />;
  return <AcademicsClassic {...props} />;
}
