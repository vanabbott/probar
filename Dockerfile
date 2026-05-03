FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod .
COPY go.sum .
COPY main.go .
RUN go mod tidy
RUN go build -o /app main.go

FROM alpine:3.20
COPY --from=build /app /app
EXPOSE 8080
ENTRYPOINT ["/app"]