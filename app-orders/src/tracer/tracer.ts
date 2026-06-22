import { trace } from "@opentelemetry/api"

//igual no broker verificar a var ambiente
if(!process.env.OTEL_SERVICE_NAME){
    throw new Error("OTEL_SERVICE_NAME must be configured")
}

export const tracer = trace.getTracer(process.env.OTEL_SERVICE_NAME)
