import {ReportDetail} from '@/features/hazards/client/ReportDetail';
export default async function DetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ReportDetail key={id} id={id} returnTo='/my-reports'/>}
